// The About dialog (app.R about_modal): who it is for, how to use it, the data, how to read the evidence, how the
// expected readiness is built and how accurate it was, and the acknowledgements. Words in i18n/about.js.
import { t, fmt, dayLabel } from "./i18n.js";
import { evidenceTag } from "./ui.js";

// app.R model_mae(): one hold-out accuracy figure
export function modelMae(study, stage, pattern) {
  const m = study.model.metrics.find((r) => r.stage === stage && new RegExp(pattern).test(r.method));
  return m ? fmt(m.mae, 2) : "—";
}

export function aboutHtml(study) {
  const pm = study.model.test_mae || {};
  const v = {
    n: study.people.length, first: dayLabel(study.first, { weekday: false }), last: dayLabel(study.last, { weekday: false }),
    tracked: study.model.keys.length, lambda: study.model.lambda,
    ridge: modelMae(study, "test", "ridge"), level: modelMae(study, "test", "^level$"), all: modelMae(study, "test", "level_all"), last5: modelMae(study, "test", "last5"),
    median: fmt(pm.median, 2), min: fmt(pm.min, 2), max: fmt(pm.max, 2),
  };
  return `
    <h3>${t("about.who")}</h3><p>${t("about.who.p")}</p>
    <h3>${t("about.how")}</h3><ol><li>${t("about.how.1")}</li><li>${t("about.how.2")}</li><li>${t("about.how.3")}</li><li>${t("about.how.4")}</li><li>${t("about.how.5")}</li></ol>
    <h3>${t("about.data")}</h3><ul><li>${t("about.data.pm", v)}</li><li>${t("about.data.nh")}</li></ul>
    <p class="fine-print">${t("about.data.anon")}</p>
    <h3>${t("about.read")}</h3><ul>
      <li>${evidenceTag("record", t("tag.record"))} ${t("about.read.record")}</li>
      <li>${evidenceTag("association", t("tag.association"))} ${t("about.read.association")}</li>
      <li>${evidenceTag("hypothesis", t("tag.hypothesis"))} ${t("about.read.hypothesis")}</li></ul>
    <h3>${t("about.expected")}</h3><p>${t("about.expected.p1", v)}</p><p>${t("about.expected.p2", v)}</p>
    <h3>${t("about.web")}</h3><p>${t("about.web.p")}</p>
    <h3>${t("about.ack")}</h3><p class="fine-print">${t("about.ack.p")}</p>`;
}
