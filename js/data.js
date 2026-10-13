// Loading web/data/ (written by tools/export_web.R). Each file is fetched once and kept.
import { preparePerson } from "./model.js";

const cache = new Map();
export function getJSON(path) {
  if (!cache.has(path)) {
    cache.set(path, fetch(path).then((r) => {
      if (!r.ok) throw new Error(`${r.status} ${path}`);
      return r.json();
    }).catch((e) => { cache.delete(path); throw e; }));
  }
  return cache.get(path);
}
const people = new Map();
export const loadStudy = () => getJSON("data/study.json");
export function loadPerson(id) {
  if (!people.has(id)) people.set(id, getJSON(`data/p/${id}.json`).then(preparePerson));
  return people.get(id);
}
// an area's study-wide file (data/<area>.json) and its per-participant files (data/<area>/<id>.json)
export const loadArea = (area) => getJSON(`data/${area}.json`);
export const loadAreaPerson = (area, id) => getJSON(`data/${area}/${id}.json`);
