# Building GeePlays: What I Learned Getting a Static Site to Talk to a Live Game Database
 
## Why I started this
 
I wanted to build GeePlays as a place to discover games. Browse a catalog, check requirements, watch trailers, and get sent to the actual official store to buy or download. Nothing fancy under the hood. Plain HTML, CSS, and JavaScript, hosted for free on GitHub Pages. No backend, no database, no build step. Just files.
 
I started with 12 games I added by hand into a JSON file. It worked, but pretty quickly I realized there was no way I was going to sit there typing out entries for hundreds of games one at a time. That frustration is basically the whole story of everything that came after.
 
## First instinct: just call an API from the browser
 
My first thought was simple. There are free game databases out there (I went with RAWG, which has over 500,000 games). Why not just have my site call it directly from the browser and pull in whatever I need?
 
Turns out browsers do not let you do that so easily, and figuring out why taught me more about how the web actually works than anything else in this project.
 
## Learning about CORS the hard way
 
When I tried calling RAWG's API straight from my site's JavaScript, I kept getting blocked. Not because my code was wrong, but because of something called CORS (that stands for Cross Origin Resource Sharing).
 
Here is the plain English version. Browsers have a built in security rule that says JavaScript running on my site is not allowed to read responses from a different site's server, unless that server explicitly says "yes, sites like this one are allowed to read my data." RAWG's API never says that. So no matter how correct my code was, the browser itself was refusing to let the data through. That is not a bug in my site. It is true for basically anyone trying to do this from a plain static site.
 
This was the first real "oh, that is how the internet works" moment of the project.
 
## Building my first serverless proxy
 
The fix was something I had never actually built before: a proxy. A small piece of server side code that sits between my site and RAWG. My site talks to it, it talks to RAWG, and it hands the answer back. Since it is not a browser, CORS does not apply to it at all.
 
I deployed this as a serverless function on Vercel, basically one small JavaScript file that runs on demand, without me having to manage an actual server. It does three things:
 
1. Takes a request from my site (like "search for zelda")
2. Forwards it to RAWG's real API, attaching my secret API key
3. Sends the answer back, with a header added that tells the browser "yes, this site is allowed to read this"
This also solved a second problem I had not even thought about yet: keeping my API key secret. Anything in a file GitHub Pages serves can be read by literally anyone who opens their browser's dev tools. My key had to live somewhere only server side code could see it, which is what environment variables are for. I set `RAWG_API_KEY` in Vercel's dashboard, not in any file that ships to visitors, and the proxy reads it at runtime.
 
## The bugs that actually taught me something
 
Getting this working was not one clean shot. It was three separate, very real bugs, each teaching me a different lesson.
 
### Bug one: a redirect pretending to be a CORS error
 
Even after building the proxy correctly, I was still getting blocked. The error looked like a CORS problem, but there was a second clue buried in the console: a 302 status, which means a redirect.
 
What was actually happening: Vercel has a feature called Deployment Protection that puts an authentication wall in front of your project, and it had defaulted to on. Every request, even from my own site, was quietly being redirected to a Vercel login page instead of reaching my function. A redirect response does not carry the CORS header I had added, so the browser reported it as a CORS failure, even though the real problem was the authentication wall in front of it.
 
The fix was one toggle: turning off Vercel Authentication for that project.
 
### Bug two: data that existed but I could not see
 
This one was the strangest. The network request was succeeding. I could literally print the exact HTML of my results section and see real games with real images sitting right there in the page. But visually, nothing. Blank.
 
The cause: every card had a CSS class meant for a nice scroll triggered fade in effect. Elements start invisible and only become visible once you scroll down to them. That is a nice touch for a static homepage section. But search results appear the instant you type, not by scrolling, so the trigger that was supposed to reveal them never fired. The data was completely there. It was just sitting at zero opacity, forever, waiting for a scroll event that made no sense for that kind of content.
 
The fix: make search results visible immediately instead of waiting on a scroll trigger that only makes sense for static page sections.
 
### Bug three: one missing line
 
Later, after rewriting my homepage to pull live data instead of a fixed list, the page just hung, showing loading skeletons that never went away.
 
Turns out I had updated the actual logic but forgotten to add a single script tag loading the file that logic depended on. The browser hit a function that simply did not exist yet, threw an error immediately, and the rest of the code never got a chance to run. No dramatic bug. Just one missing line, in the wrong order.
 
## What actually solved these, and what I would tell someone starting out
 
Every single one of these got solved the same way. Opening the browser's DevTools and actually looking. The Console for errors, the Network tab for what requests were really happening and what status code they came back with, and View Page Source to see exactly what the server sent, with no assumptions. Guessing harder never worked. Looking at what the browser actually did, every time, did.
 
If I had one piece of advice for someone starting a project like this, it would be this: do not be afraid of a red error message. It is usually not vague. It is the browser handing you the answer, if you read the whole thing instead of skimming it.
 
## A note on how this actually got built
 
I want to be upfront about this part. I used AI (Claude) heavily throughout this project, for planning the architecture, writing the code for the site and the proxy, and walking through each bug with me.
 
But it was not "type a prompt, get a working site." I made the real decisions about what GeePlays should be and look like. I did the actual clicking through of the Vercel dashboard myself, added my own real API key, ran the console commands and read the results myself, and pushed every commit. When things broke, the redirect, the invisible cards, the missing script tag, I was the one staring at my actual browser and reporting back what it showed, and that back and forth is genuinely how each bug got solved. I came away understanding why each fix worked, not just that it did.
 
I think that is a fair way to describe it: assisted by AI, not replaced by AI. I could not have explained CORS, serverless functions, or environment variables in my own words before this project. I can now.
 
## The stack, for anyone curious
 
* HTML, CSS, and vanilla JavaScript. No frameworks, no build step.
* GitHub Pages for free static hosting, straight from my repo.
* The RAWG API as the live game database powering search and browsing.
* Vercel for hosting the one serverless proxy function that makes the RAWG connection possible.
* Git and GitHub for version control, and the thing that actually pushes changes live.
If you are building something similar and hit the same CORS wall I did, that is not a sign you are doing something wrong. It is just how browsers work, and a small proxy is the normal way around it.
 
***
 
A couple of exact technical names above could not be respelled without being wrong: the real project name `geeplays-rawg-proxy` on Vercel, and CSS properties such as `border-radius`, which only exist spelled that way in the language itself.
