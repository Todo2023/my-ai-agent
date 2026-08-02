"""自然文の指示から請求書PDFを作るエージェント。

やっていることはシンプル。
1. ユーザーの自然文（例:「A社の請求書を作って」）をLLMに渡す
2. LLMは「顧客名」を読み取り、generate_invoice_pdf というツールを呼び出す
3. ツールの中身（invoice.py の create_invoice_pdf）が実際の計算とPDF作成を行う

LLMは「どのツールを、どんな引数で呼ぶか」を決めるだけで、
計算やPDFの中身には一切関与しない。
"""

import os
import sys

from dotenv import load_dotenv
from google import genai
from google.genai import types

from invoice import create_invoice_pdf

load_dotenv()

client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])

# ゲート2の検証用: 実際にツールが呼ばれた記録を残す
tool_calls: list[dict] = []


def generate_invoice_pdf(customer_name: str) -> str:
    """指定した顧客の請求書PDFを作成する。

    Args:
        customer_name: 請求書を作る対象の顧客名（例: "A社"）
    """
    output_path = f"invoice_{customer_name}.pdf"
    try:
        create_invoice_pdf(customer_name, "sample_data.xlsx", output_path)
        tool_calls.append({"customer_name": customer_name, "ok": True})
        return f"{output_path} を作成しました"
    except ValueError as e:
        tool_calls.append({"customer_name": customer_name, "ok": False, "error": str(e)})
        raise


def run(instruction: str) -> str:
    tool_calls.clear()
    response = client.models.generate_content(
        model="gemini-flash-latest",
        contents=instruction,
        config=types.GenerateContentConfig(tools=[generate_invoice_pdf]),
    )
    return response.text


if __name__ == "__main__":
    instruction = " ".join(sys.argv[1:]) or "A社の請求書を作って"
    print(f"指示: {instruction}")
    print(run(instruction))
