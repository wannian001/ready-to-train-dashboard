// The design summary page (#report): first what the project solves (the assignment, the problem chosen, what came
// out: three cards written for the web), then the summary submitted with the R app, in full, in the order of its three
// columns (purpose and data · the interface and how to use it · visual choices), then the appendix of resources.
// Words in ../report-content.js; the PDF is the submitted file reprinted from its source without the student number.
import { getLang, setLang, t, addWords } from "../i18n.js";
import { esc } from "../ui.js";
import { REPORT, BRIEF } from "../report-content.js";

addWords({
  en: { "rp.read_en": "Read the English original", "rp.read_zh": "阅读中文译文" },
  zh: { "rp.read_en": "看英文原文", "rp.read_zh": "阅读中文译文" },
});

const PDF = "report/Design_Summary_JiakuoTang.pdf";
const section = (n, s) => `<section class="health-card rp-card"><h2><span class="rp-n">${n}</span>${s.h}</h2>${s.body.map((p) => `<p>${p}</p>`).join("")}</section>`;
const figure = (src, alt, caption, extra = "") => `<figure class="rp-fig"><div class="rp-frame${extra ? " pad" : ""}"><img src="report/${src}" alt="${esc(alt)}" loading="lazy">${extra}</div><figcaption>${caption}</figcaption></figure>`;
// Fig. 1's numbered markers, placed where the submitted PDF put them (mm on a 150 mm wide frame, as % of the frame)
const BADGES = [[2.4, 6.62], [2.4, 21.45], [2.4, 29.8], [67.33, 60.16]]
  .map(([x, y], i) => `<span class="rp-badge" style="left:${x}%;top:${y}%" aria-hidden="true">${i + 1}</span>`).join("");

export default {
  render() {
    const r = REPORT[getLang()] || REPORT.en;
    const zh = getLang() === "zh";
    const mae = r.mae.map(([label, v, hi]) => `<tr${hi ? ' class="hi"' : ""}><td>${label}</td><td class="v">${v}</td></tr>`).join("");
    const appendix = r.appendix.groups.map(([name, rows]) =>
      `<tr class="group"><td colspan="3">${name}</td></tr>${rows.map((row) => `<tr>${row.map((c, i) => `<td data-label="${esc(r.appendix.head[i])}">${c}</td>`).join("")}</tr>`).join("")}`).join("");
    const b = BRIEF[getLang()] || BRIEF.en;
    const pages = [["today", "nav.today"], ["choices", "nav.choices"], ["habits", "nav.habits"]]
      .map(([go, key]) => `<a href="#${go}" data-go="${go}">${esc(t(key))} ›</a>`).join("");
    const cards = b.cards.map((c, i) => `<section class="health-card rp-brief-card"><h3><span class="rp-n">${["A", "B", "C"][i]}</span>${c.h}</h3>
      <ul>${c.items.map((x) => `<li>${x}</li>`).join("")}</ul>${i === 2 ? `<p class="rp-try"><span>${esc(b.tryIt)}</span>${pages}</p>` : ""}</section>`).join("");
    return `
      <section class="rp-brief" aria-labelledby="rp-brief-title">
        <h2 id="rp-brief-title">${esc(b.title)}</h2>
        <p class="rp-brief-lede">${esc(b.lede)}</p>
        <div class="rp-brief-grid">${cards}</div>
        <p class="fine-print">${esc(b.source)}</p>
      </section>
      <h2 class="rp-section-head">${esc(b.summaryHead)}</h2>
      <div class="rp-note">
        <p>${esc(r.note)}</p>
        <p class="rp-links"><a href="${PDF}" download>${esc(r.pdf)}</a>
          <button type="button" class="link-button" id="rp-lang">${esc(t(zh ? "rp.read_en" : "rp.read_zh"))}</button></p>
      </div>
      <article class="rp" lang="${zh ? "zh-CN" : "en"}">
        <header class="rp-top">
          <div><h2 class="rp-title">${r.title} <span class="rp-suffix">${r.titleSuffix}</span></h2><p class="rp-sub">${r.sub}</p></div>
          <p class="rp-meta">${r.meta.join("<br>")}</p>
        </header>
        <div class="rp-col">
          ${section(1, r.s1)}
          ${section(2, r.s2)}
          <section class="health-card rp-card"><h2><span class="rp-n">3</span>${r.s3.h}</h2>${r.s3.body.map((p) => `<p>${p}</p>`).join("")}
            <div class="rp-finding"><span class="rp-big">−0.46</span><p>${r.finding}</p></div>
            <table class="rp-mae"><caption>${r.maeCaption}</caption><tbody>${mae}</tbody></table>
            <p>${r.s3after}</p></section>
          ${section(4, r.s4)}
        </div>
        <div class="rp-col">
          ${figure("fig_today.png", r.fig1alt, r.fig1, BADGES)}
          <section class="health-card rp-card"><h2>${r.howTitle}</h2>
            <ol class="rp-steps">${r.steps.map((s, i) => `<li><span class="rp-badge" aria-hidden="true">${i + 1}</span>${s}</li>`).join("")}</ol></section>
          ${section(5, r.s5)}
        </div>
        <div class="rp-col">
          ${figure("fig_felt.png", r.fig2alt, r.fig2)}
          ${figure("fig_habits.png", r.fig3alt, r.fig3)}
          ${figure("fig_training.png", r.fig4alt, r.fig4)}
          ${section(6, r.s6)}
        </div>
        <footer class="rp-foot"><p>${r.refs}</p><p>${r.toAppendix}</p></footer>
        <section class="rp-appendix" id="appendix">
          <h2>${r.appendix.title}</h2><p class="rp-sub">${r.appendix.sub}</p>
          <div class="table-wrap"><table class="rp-res">
            <thead><tr>${r.appendix.head.map((h) => `<th scope="col">${h}</th>`).join("")}</tr></thead>
            <tbody>${appendix}</tbody></table></div>
        </section>
      </article>`;
  },
  mount(el, ctx) {
    const b = el.querySelector("#rp-lang");
    if (b) b.onclick = () => { const next = getLang() === "zh" ? "en" : "zh"; try { localStorage.setItem("readytrain.lang", next); } catch { /* private mode */ } setLang(next); ctx.refresh(); };
  },
};
