"""サンプルの請求データ(Excel)を作るための使い捨てスクリプト。

実行すると sample_data.xlsx が作られる。
列: 顧客名 / 日付 / 品目 / 数量 / 単価 / 税率 / 件名 / 納品日
"""

import datetime as dt

import openpyxl

wb = openpyxl.Workbook()
ws = wb.active
ws.title = "請求データ"

ws.append(["顧客名", "日付", "品目", "数量", "単価", "税率", "件名", "納品日"])

d = dt.date(2026, 7, 27)
ws.append(["A社", dt.date(2026, 7, 16), "MTG", 1, 75000, 10, "営業（販売促進）資料作成 他", d])
ws.append(["A社", dt.date(2026, 7, 22), "MTG（たたき台案へのすり合わせ）", 1, 0, 10, "営業（販売促進）資料作成 他", d])
ws.append(["A社", dt.date(2026, 7, 27), "営業（販売促進）資料納品", 1, 0, 10, "営業（販売促進）資料作成 他", d])

ws.append(["B社", dt.date(2026, 7, 10), "ロゴデザイン", 1, 80000, 10, "ロゴ・名刺デザイン一式", dt.date(2026, 7, 20)])
ws.append(["B社", dt.date(2026, 7, 20), "名刺デザイン", 100, 50, 10, "ロゴ・名刺デザイン一式", dt.date(2026, 7, 20)])

wb.save("sample_data.xlsx")
print("sample_data.xlsx を作成しました")
