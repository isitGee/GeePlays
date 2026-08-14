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
    data.mobileMoney.forEach((m) => {
      const row = document.createElement("div");
      row.className = "support-item";
      const left = document.createElement("div");
      left.innerHTML = `<strong>${escapeHtml(m.provider)}</strong> <span class="muted">(${escapeHtml(m.country)})</span><div class="muted">${escapeHtml(m.instructions)}</div>`;
      const right = document.createElement("div");
      right.className = "support-actions";
      const num = document.createElement("div");
      num.className = "support-number";
      num.textContent = m.number;
      right.appendChild(num);
      right.appendChild(makeCopyBtn(m.number));
      row.appendChild(left);
      row.appendChild(right);
      mobileList.appendChild(row);
    });
  }

  if (bankEl && data.bank) {
    bankEl.replaceChildren();
    const b = data.bank;
    const container = document.createElement("div");
    container.className = "support-bank";
    container.innerHTML = `<div><strong>${escapeHtml(b.bankName)}</strong> — ${escapeHtml(b.branch || "")}</div>`;
    const info = document.createElement("div");
    info.className = "muted";
    info.innerHTML = `${escapeHtml(b.accountName)} &middot; <span class=\"bank-number\">${escapeHtml(b.accountNumber)}</span>`;
    container.appendChild(info);
    container.appendChild(makeCopyBtn(b.accountNumber));
    bankEl.appendChild(container);
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
