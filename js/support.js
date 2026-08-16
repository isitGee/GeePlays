/* Support loader — fetches data/support.json and injects donation + contact info */

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

function makeCopyBtn(text) {
  const btn = document.createElement("button");
  btn.className = "btn btn-ghost btn-sm";
  btn.type = "button";
  btn.textContent = "Copy";
  btn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(text);
      const old = btn.textContent;
      btn.textContent = "Copied";
      setTimeout(() => (btn.textContent = old), 1500);
    } catch (e) {
      console.error("Clipboard failed", e);
    }
  });
  return btn;
}

function getBrandLogoByProvider(provider) {
  const normalized = (provider || "").toLowerCase();

  if (normalized.includes("vodacom")) {
    return {
      logoClass: "vodacom",
      logoSrc: "./assets/vodacom_logo.jpg",
      logoAlt: "Vodacom logo",
    };
  }

  if (normalized.includes("airtel")) {
    return {
      logoClass: "airtel",
      logoSrc: "./assets/airtel_logo.jpg",
      logoAlt: "Airtel logo",
    };
  }

  if (normalized.includes("nmb") || normalized.includes("bank")) {
    return {
      logoClass: "nmb",
      logoSrc: "./assets/nmb_logo.jpg",
      logoAlt: "NMB logo",
    };
  }

  return {
    logoClass: "mpesa",
    logoSrc: "./assets/vodacom_logo.jpg",
    logoAlt: "Vodacom logo",
  };
}

function makePaymentCard({
  title,
  country,
  number,
  instructions,
  logoClass,
  logoSrc,
  logoAlt,
}) {
  const card = document.createElement("article");
  card.className = "support-card";

  const header = document.createElement("div");
  header.className = "support-card-header";

  const logo = document.createElement("div");
  logo.className = `brand-logo ${logoClass}`;

  const logoImg = document.createElement("img");
  logoImg.src = logoSrc;
  logoImg.alt = logoAlt || title;
  logoImg.loading = "lazy";
  logo.appendChild(logoImg);

  const tag = document.createElement("span");
  tag.className = "support-tag";
  tag.textContent = country;

  header.appendChild(logo);
  header.appendChild(tag);

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
  actions.appendChild(makeCopyBtn(number));

  card.appendChild(header);
  card.appendChild(heading);
  card.appendChild(numberEl);
  card.appendChild(note);
  card.appendChild(actions);

  return card;
}

function populateSupport(data) {
  if (!data) return;
  const titleEl = document.getElementById("supportTitle");
  const introEl = document.getElementById("supportIntro");
  const mobileList = document.getElementById("mobileMoneyList");
  const bankEl = document.getElementById("bankDetails");
  const footerContacts = document.getElementById("footerContactsList");

  if (titleEl && data.supportTitle) titleEl.textContent = data.supportTitle;
  if (introEl && data.intro) introEl.textContent = data.intro;

  if (mobileList && Array.isArray(data.mobileMoney)) {
    mobileList.replaceChildren();
    mobileList.className = "support-grid";
    data.mobileMoney.forEach((m) => {
      const brand = getBrandLogoByProvider(m.provider);
      const card = makePaymentCard({
        title: m.provider,
        country: m.country,
        number: m.number,
        instructions: m.instructions,
        logoClass: brand.logoClass,
        logoSrc: brand.logoSrc,
        logoAlt: brand.logoAlt,
      });
      mobileList.appendChild(card);
    });
  }

  if (bankEl && data.bank) {
    bankEl.replaceChildren();
    bankEl.className = "support-grid";
    const b = data.bank;
    const brand = getBrandLogoByProvider(b.bankName);
    const card = makePaymentCard({
      title: b.bankName,
      country: b.branch || "Tanzania",
      number: b.accountNumber,
      instructions: b.instructions,
      logoClass: brand.logoClass,
      logoSrc: brand.logoSrc,
      logoAlt: brand.logoAlt,
    });
    bankEl.appendChild(card);
  }

  if (footerContacts && Array.isArray(data.contacts)) {
    footerContacts.replaceChildren();
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
      footerContacts.appendChild(li);
    });
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  const data = await loadSupportData();
  populateSupport(data);
});
