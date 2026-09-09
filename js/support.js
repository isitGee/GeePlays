/* =========================================================
   GeePlays — Support page logic
   Loads data/support.json and builds branded payment cards.

   Payment behavior, read this before changing anything:
   - Only the recipient/payment NUMBER is ever pre-filled.
   - No amount is ever hard-coded, suggested, or pre-filled —
     the person paying chooses their own amount, always.
   - "Pay Now" opens the phone dialer with the provider's real,
     verified USSD root code (e.g. *150*00# for Vodacom M-Pesa,
     *150*60# for Airtel Money Tanzania). It cannot reliably
     inject the recipient number into a multi-step USSD menu —
     no public mechanism does that safely — so the UI is honest
     about it: it opens the right menu and tells the person
     which number to enter once they're in it.
   - On desktop, tel: links generally do nothing useful, so the
     copy button + on-screen number are the real fallback there.
   ========================================================= */

// Verified against vodacom.co.tz and airtel.co.tz (see the change summary
// for sources). Never invent or guess a USSD code — leave blank and fall
// back to copy-only if a provider isn't listed here.
const USSD_CODES = {
  vodacom: { code: "*150*00#", menuHint: "Choose Send Money, then enter this number:" },
  airtel: { code: "*150*60#", menuHint: "Choose Send Money, then enter this number:" }
};

async function loadSupportData() {
  try {
    const res = await fetch("data/support.json");
    if (!res.ok) throw new Error("Failed to load support.json");
    return await res.json();
  } catch (err) {
    console.error("GeePlays: could not load support data.", err);
    return null;
  }
}

function makeCopyBtn(text, label = "Copy Number") {
  const btn = document.createElement("button");
  btn.className = "btn btn-ghost btn-sm";
  btn.type = "button";
  btn.textContent = label;
  btn.setAttribute("aria-label", `${label}: ${text}`);
  btn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(text);
      const old = btn.textContent;
      btn.textContent = "Copied ✓";
      setTimeout(() => (btn.textContent = old), 1600);
    } catch (e) {
      console.error("Clipboard failed", e);
    }
  });
  return btn;
}

function telHref(ussdCode) {
  // '#' must be percent-encoded in a tel: URL or the browser treats it
  // as a URL fragment and drops it.
  return `tel:${ussdCode.replace(/#/g, "%23")}`;
}

function makePayNowLink(ussdKey) {
  const info = USSD_CODES[ussdKey];
  if (!info) return null;
  const a = document.createElement("a");
  a.className = "btn btn-primary btn-sm";
  a.href = telHref(info.code);
  a.textContent = "Pay Now";
  a.setAttribute("aria-label", `Open phone dialer with ${info.code} to start a payment`);
  return a;
}

function getBrandInfo(provider) {
  const normalized = (provider || "").toLowerCase();

  if (normalized.includes("vodacom") || normalized.includes("m-pesa") || normalized.includes("mpesa")) {
    return {
      cardClass: "mpesa",
      logoClass: "mpesa",
      logoSrc: "./assets/vodacom_logo.jpg",
      logoAlt: "Vodacom M-Pesa logo",
      ussdKey: "vodacom"
    };
  }
  if (normalized.includes("airtel")) {
    return {
      cardClass: "airtel",
      logoClass: "airtel",
      logoSrc: "./assets/airtel_logo.jpg",
      logoAlt: "Airtel Money logo",
      ussdKey: "airtel"
    };
  }
  if (normalized.includes("nmb") || normalized.includes("bank")) {
    return {
      cardClass: "bank",
      logoClass: "nmb",
      logoSrc: "./assets/nmb_logo.jpg",
      logoAlt: "Bank logo",
      ussdKey: null
    };
  }
  return { cardClass: "", logoClass: "", logoSrc: "", logoAlt: provider, ussdKey: null };
}

function makePaymentCard({ title, country, number, instructions, brand, copyLabel = "Copy Number" }) {
  const card = document.createElement("article");
  card.className = `support-card ${brand.cardClass}`;

  const header = document.createElement("div");
  header.className = "support-card-header";

  const logo = document.createElement("div");
  logo.className = `brand-logo ${brand.logoClass}`;
  const logoImg = document.createElement("img");
  logoImg.src = brand.logoSrc;
  logoImg.alt = brand.logoAlt || title;
  logoImg.loading = "lazy";
  logo.appendChild(logoImg);

  const tag = document.createElement("span");
  tag.className = "support-tag";
  tag.textContent = country;

  header.appendChild(logo);
  header.appendChild(tag);

  const body = document.createElement("div");
  body.className = "support-card-body";

  const heading = document.createElement("h3");
  heading.textContent = title;

  const numberEl = document.createElement("div");
  numberEl.className = "support-number";
  numberEl.textContent = number;

  const note = document.createElement("p");
  note.className = "muted";
  note.textContent = instructions;

  const actions = document.createElement("div");
  actions.className = "support-actions";
  actions.appendChild(makeCopyBtn(number, copyLabel));

  const payLink = brand.ussdKey ? makePayNowLink(brand.ussdKey) : null;
  if (payLink) actions.appendChild(payLink);

  body.appendChild(heading);
  body.appendChild(numberEl);
  body.appendChild(note);
  body.appendChild(actions);

  if (brand.ussdKey) {
    const hint = document.createElement("p");
    hint.className = "ussd-hint";
    hint.textContent = `Pay Now opens your phone's dialer with ${USSD_CODES[brand.ussdKey].code} ready — ${USSD_CODES[brand.ussdKey].menuHint} ${number}. On a computer this will generally do nothing, so use the number above with your phone instead. You choose the amount yourself in the menu — GeePlays never sets or suggests one.`;
    body.appendChild(hint);
  } else {
    const hint = document.createElement("p");
    hint.className = "ussd-hint";
    hint.textContent = "Use your bank's app, USSD banking menu, or visit a branch to complete a transfer to this account. You choose the amount yourself.";
    body.appendChild(hint);
  }

  card.appendChild(header);
  card.appendChild(body);
  return card;
}

function populateSupport(data) {
  if (!data) return;
  const titleEl = document.getElementById("supportTitle");
  const introEl = document.getElementById("supportIntro");
  const mobileList = document.getElementById("mobileMoneyList");
  const bankEl = document.getElementById("bankDetails");
  const footerContacts = document.getElementById("footerContactsList");
  const pageContacts = document.getElementById("supportContactsList");

  if (titleEl && data.supportTitle) titleEl.textContent = data.supportTitle;
  if (introEl && data.intro) introEl.textContent = data.intro;

  if (mobileList && Array.isArray(data.mobileMoney)) {
    mobileList.replaceChildren();
    mobileList.className = "support-grid";
    data.mobileMoney.forEach((m) => {
      const brand = getBrandInfo(m.provider);
      mobileList.appendChild(makePaymentCard({
        title: m.provider,
        country: m.country,
        number: m.number,
        instructions: m.instructions,
        brand
      }));
    });
  }

  if (bankEl && data.bank) {
    bankEl.replaceChildren();
    bankEl.className = "support-grid";
    const b = data.bank;
    const brand = getBrandInfo(b.bankName);
    bankEl.appendChild(makePaymentCard({
      title: `${b.bankName}${b.accountName ? " — " + b.accountName : ""}`,
      country: b.branch || "Tanzania",
      number: b.accountNumber,
      instructions: b.instructions,
      brand,
      copyLabel: "Copy Account Number"
    }));
  }

  const renderContactList = (container) => {
    if (!container || !Array.isArray(data.contacts)) return;
    container.replaceChildren();
    data.contacts.forEach((c) => {
      const li = document.createElement("li");
      if ((c.value || "").includes("@")) {
        const a = document.createElement("a");
        a.href = `mailto:${c.value}`;
        a.textContent = `${c.label}: ${c.value}`;
        li.appendChild(a);
      } else if ((c.value || "").startsWith("@")) {
        const a = document.createElement("a");
        a.href = `https://twitter.com/${c.value.replace(/^@/, "")}`;
        a.target = "_blank";
        a.rel = "noopener";
        a.textContent = `${c.label}: ${c.value}`;
        li.appendChild(a);
      } else {
        li.textContent = `${c.label}: ${c.value}`;
      }
      container.appendChild(li);
    });
  };

  renderContactList(footerContacts);
  renderContactList(pageContacts);
}

document.addEventListener("DOMContentLoaded", async () => {
  const data = await loadSupportData();
  populateSupport(data);
});
