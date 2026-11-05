import io
import pytest
from fastapi.testclient import TestClient


def test_upload_txt_success(client: TestClient, auth_headers):
    file_content = b"This is clean launch text with 24 hours of battery life and clear audio."
    files = {"file": ("launch_copy.txt", file_content, "text/plain")}
    data = {"title": "Uploaded TXT Launch Copy"}

    resp = client.post("/assets/upload", files=files, data=data, headers=auth_headers["creator"])
    assert resp.status_code == 201
    asset = resp.json()
    assert asset["title"] == "Uploaded TXT Launch Copy"
    assert asset["source_filename"] == "launch_copy.txt"
    assert asset["current_revision"] == 1
    assert "24 hours" in asset["body"]
    assert len(asset["revisions"]) == 1


def test_upload_docx_success(client: TestClient, auth_headers):
    import docx

    # Create in-memory docx
    doc = docx.Document()
    doc.add_paragraph("First paragraph from docx with 24 hours of battery life.")
    doc.add_paragraph("Second paragraph from docx with 12-month warranty.")

    buf = io.BytesIO()
    doc.save(buf)
    buf.seek(0)

    files = {"file": ("brand_specs.docx", buf.getvalue(), "application/vnd.openxmlformats-officedocument.wordprocessingml.document")}
    resp = client.post("/assets/upload", files=files, headers=auth_headers["creator"])
    assert resp.status_code == 201
    asset = resp.json()
    assert asset["source_filename"] == "brand_specs.docx"
    assert "First paragraph from docx" in asset["body"]
    assert "12-month warranty" in asset["body"]
    assert asset["current_revision"] == 1


def test_upload_pdf_success(client: TestClient, auth_headers):
    import fitz

    # Create in-memory pdf
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((50, 50), "PDF content with 24 hours of listening time and balanced sound.")

    buf = io.BytesIO()
    doc.save(buf)
    buf.seek(0)

    files = {"file": ("product_sheet.pdf", buf.getvalue(), "application/pdf")}
    resp = client.post("/assets/upload", files=files, headers=auth_headers["creator"])
    assert resp.status_code == 201
    asset = resp.json()
    assert asset["source_filename"] == "product_sheet.pdf"
    assert "PDF content with 24 hours" in asset["body"]
    assert asset["current_revision"] == 1


def test_upload_unsupported_file_type_rejected(client: TestClient, auth_headers):
    files = {"file": ("script.exe", b"binarycontent", "application/octet-stream")}
    resp = client.post("/assets/upload", files=files, headers=auth_headers["creator"])
    assert resp.status_code == 400
    assert "Unsupported file type" in resp.json()["detail"]


def test_upload_file_size_exceeds_5mb_rejected(client: TestClient, auth_headers):
    # 5.1 MB
    oversized = b"A" * (5 * 1024 * 1024 + 1024)
    files = {"file": ("huge_document.txt", oversized, "text/plain")}
    resp = client.post("/assets/upload", files=files, headers=auth_headers["creator"])
    assert resp.status_code == 400
    assert "exceeds 5 MB" in resp.json()["detail"]


def test_upload_role_enforcement(client: TestClient, auth_headers):
    files = {"file": ("notes.txt", b"Some reviewer notes", "text/plain")}
    # Reviewer cannot upload assets (only creator and brand_manager)
    resp = client.post("/assets/upload", files=files, headers=auth_headers["reviewer"])
    assert resp.status_code == 403
