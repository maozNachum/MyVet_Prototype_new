import { MockEmbeddingAdapter } from "../supabase/functions/_shared/ai/providers/mockEmbedding.ts";

const adapter = new MockEmbeddingAdapter();
const dimensions = 768;
const model = "stage5-synthetic-calibration";

const sources = [
  { id: "S1", text: "חיסון כלבת ניתן בתאריך 1 ביולי 2026. החיסון הבא בעוד שנה." },
  { id: "S2", text: "בדיקת דם הושלמה. ערכי הכבד נמצאו בטווח התקין." },
  { id: "S3", text: "ביקור רפואי בשל צליעה ברגל הקדמית. הומלץ מעקב בעוד שבוע." },
  { id: "S4", text: "סיכום DigitalCare מאושר: שיעול קל ללא שינוי בתיאבון." },
];

const questions = [
  { id: "Q1", text: "מתי ניתן חיסון הכלבת?", expected: ["S1"] },
  { id: "Q2", text: "מה היו תוצאות בדיקת הדם והכבד?", expected: ["S2"] },
  { id: "Q3", text: "מה נכתב על הצליעה ברגל?", expected: ["S3"] },
  { id: "Q4", text: "האם הייתה שיחת DigitalCare על שיעול?", expected: ["S4"] },
  { id: "Q5", text: "מה כתובת המרפאה?", expected: [] },
];

const embed = (text, task) => adapter.embed({ text, task, model, dimensions, timeoutMs: 1_000 });
const cosine = (left, right) => left.reduce((sum, value, index) => sum + value * right[index], 0);
const sourceVectors = new Map();
for (const source of sources) sourceVectors.set(source.id, (await embed(source.text, "retrieval_document")).embedding);

const rows = [];
for (const question of questions) {
  const queryVector = (await embed(question.text, "retrieval_query")).embedding;
  const scores = sources.map((source) => ({
    sourceId: source.id,
    similarity: Number(cosine(queryVector, sourceVectors.get(source.id)).toFixed(4)),
  })).sort((left, right) => right.similarity - left.similarity);
  rows.push({ ...question, scores });
}

const positiveScores = rows.flatMap((row) => row.scores
  .filter((score) => row.expected.includes(score.sourceId)).map((score) => score.similarity));
const negativeScores = rows.flatMap((row) => row.scores
  .filter((score) => !row.expected.includes(score.sourceId)).map((score) => score.similarity));
const minimumPositive = Math.min(...positiveScores);
const maximumNegative = Math.max(...negativeScores);
const recommendedMockThreshold = minimumPositive > maximumNegative
  ? Number(((minimumPositive + maximumNegative) / 2).toFixed(2))
  : null;
const thresholds = [...new Set([0.2, 0.3, 0.4, 0.5, 0.6, 0.7, recommendedMockThreshold]
  .filter((value) => typeof value === "number"))].sort((a, b) => a - b);

const report = {
  provider: "mock",
  dataset: "synthetic-only",
  note: "This calibrates the deterministic test provider only. Gemini must be calibrated again in Supabase Preview.",
  minimumPositive,
  maximumNegative,
  recommendedMockThreshold,
  thresholds: thresholds.map((threshold) => ({
    threshold,
    results: rows.map((row) => ({
      questionId: row.id,
      returnedSources: row.scores.filter((score) => score.similarity >= threshold),
    })),
  })),
};

console.log(JSON.stringify(report, null, 2));

if (recommendedMockThreshold === null) process.exitCode = 1;
for (const row of rows) {
  const returned = row.scores.filter((score) => score.similarity >= recommendedMockThreshold).map((score) => score.sourceId);
  if (returned.some((sourceId) => !row.expected.includes(sourceId))
    || row.expected.some((sourceId) => !returned.includes(sourceId))) process.exitCode = 1;
}
