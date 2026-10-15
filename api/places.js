import { places } from "../server/members.js";

export default function handler(req, res) {
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(places()));
}
