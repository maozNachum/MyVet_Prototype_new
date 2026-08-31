from pathlib import Path
import pypdfium2 as pdfium

root = Path(__file__).resolve().parents[2]
pdf_path = root / "output" / "pdf" / "MyVet_Production_Readiness_Action_Plan_HE.pdf"
render_dir = root / "tmp" / "pdfs" / "rendered"
render_dir.mkdir(parents=True, exist_ok=True)

pdf = pdfium.PdfDocument(str(pdf_path))
for index in range(len(pdf)):
    page = pdf[index]
    bitmap = page.render(scale=1.45)
    image = bitmap.to_pil()
    image.save(render_dir / f"page-{index + 1:02d}.png")
print(f"pages={len(pdf)}")
