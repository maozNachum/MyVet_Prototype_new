import { FileBlob, PresentationFile } from '@oai/artifact-tool';
const p=await PresentationFile.importPptx(await FileBlob.load('template-starter.pptx'));
for (const [si,name] of [[0,'TextBox 4'],[8,'TextBox 1'],[8,'TextBox 2'],[9,'TextBox 6']]) {
 const x=p.slides.items[si].shapes.items.find(y=>y.name===name);
 console.log('---',si+1,name); console.log(JSON.stringify(x?.data?.text,null,2)); console.log(JSON.stringify(x?.data?.position,null,2));
}
