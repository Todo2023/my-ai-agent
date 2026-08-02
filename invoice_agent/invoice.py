"""指定した顧客名の請求書PDFを、Excelの請求データから作る。

このファイルにはAI(LLM)は一切登場しない。
「表を読む→計算する→PDFに書く」という決まった処理だけを行う。
この土台が正しく動くことを先に確認してから、あとでAIをかぶせて
「自然文の指示から顧客名を読み取る」部分を追加していく。
"""

import sys

import openpyxl
from fpdf import FPDF


def list_customer_names(excel_path: str) -> list[str]:
    """Excelに登録されている顧客名の一覧を、重複なしで返す。"""
    wb = openpyxl.load_workbook(excel_path)
    ws = wb.active

    names = []
    for row in ws.iter_rows(min_row=2, values_only=True):
        name = row[0]
        if name not in names:
            names.append(name)
    return names


def load_items_for_customer(excel_path: str, customer_name: str) -> list[dict]:
    """Excelから、指定した顧客の行だけを取り出す。"""
    wb = openpyxl.load_workbook(excel_path)
    ws = wb.active

    items = []
    for row in ws.iter_rows(min_row=2, values_only=True):
        name, item, quantity, unit_price = row
        if name == customer_name:
            items.append(
                {
                    "item": item,
                    "quantity": quantity,
                    "unit_price": unit_price,
                    "subtotal": quantity * unit_price,
                }
            )
    return items


def create_invoice_pdf(customer_name: str, excel_path: str, output_path: str) -> None:
    """指定した顧客の請求書PDFを作る。"""
    items = load_items_for_customer(excel_path, customer_name)

    if not items:
        raise ValueError(f"「{customer_name}」のデータが見つかりませんでした")

    total = sum(item["subtotal"] for item in items)

    pdf = FPDF()
    pdf.add_page()
    # 標準フォントは日本語に対応していないため、日本語フォントを読み込んで使う
    pdf.add_font("IPAGothic", "", "/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf")
    pdf.set_font("IPAGothic", size=16)
    pdf.cell(0, 10, "請求書", new_x="LMARGIN", new_y="NEXT")

    pdf.set_font("IPAGothic", size=12)
    pdf.cell(0, 10, f"宛先: {customer_name}", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(5)

    pdf.set_font("IPAGothic", size=10)
    pdf.cell(90, 8, "品目", border=1)
    pdf.cell(30, 8, "数量", border=1)
    pdf.cell(35, 8, "単価", border=1)
    pdf.cell(35, 8, "小計", border=1, new_x="LMARGIN", new_y="NEXT")

    for item in items:
        pdf.cell(90, 8, str(item["item"]), border=1)
        pdf.cell(30, 8, str(item["quantity"]), border=1)
        pdf.cell(35, 8, f"{item['unit_price']:,}", border=1)
        pdf.cell(35, 8, f"{item['subtotal']:,}", border=1, new_x="LMARGIN", new_y="NEXT")

    pdf.ln(5)
    pdf.set_font("IPAGothic", size=12)
    pdf.cell(0, 10, f"合計: {total:,}円", new_x="LMARGIN", new_y="NEXT")

    pdf.output(output_path)
    print(f"{output_path} を作成しました（合計: {total:,}円）")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("使い方: uv run invoice.py 顧客名")
        sys.exit(1)

    customer = sys.argv[1]
    create_invoice_pdf(customer, "sample_data.xlsx", f"invoice_{customer}.pdf")
