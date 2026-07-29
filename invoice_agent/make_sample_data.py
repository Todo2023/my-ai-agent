"""サンプルの請求データ(Excel)を作るための使い捨てスクリプト。

実行すると sample_data.xlsx が作られる。
列: 顧客名 / 品目 / 数量 / 単価
"""

import openpyxl

wb = openpyxl.Workbook()
ws = wb.active
ws.title = "請求データ"

ws.append(["顧客名", "品目", "数量", "単価"])
ws.append(["A社", "Webサイト制作", 1, 300000])
ws.append(["A社", "サーバー保守（月額）", 1, 20000])
ws.append(["B社", "ロゴデザイン", 1, 80000])
ws.append(["B社", "名刺デザイン", 100, 50])

wb.save("sample_data.xlsx")
print("sample_data.xlsx を作成しました")
