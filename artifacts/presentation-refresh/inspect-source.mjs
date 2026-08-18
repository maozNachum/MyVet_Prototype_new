import fs from "node:fs/promises";
import { FileBlob, PresentationFile } from "@oai/artifact-tool";

const source = process.argv[2];
const output = process.argv[3];
const presentation = await PresentationFile.importPptx(await FileBlob.load(source));
const snapshot = await presentation.inspect({
  kind: "deck,slide,textbox,shape,image,table,chart,notes,layout",
  include: "id,slide,name,title,text,textPreview,textChars,textLines,bbox,bboxUnit,isPlaceholder,placeholders,alt",
  maxChars: 200000,
});
await fs.writeFile(output, snapshot.ndjson, "utf8");
await fs.writeFile(output.replace(/\.ndjson$/, ".proto.json"), JSON.stringify(presentation.toProto(), null, 2), "utf8");
console.log(`slides=${presentation.slides.items.length}`);
