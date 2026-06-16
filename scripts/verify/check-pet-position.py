"""读 vault.db 里和桌宠位置相关的 settings。"""
import sqlite3
import os

db_path = os.path.expandvars(r"%APPDATA%\@nuwa-pet\desktop\Bailin\vault.db")
print("vault:", db_path)

con = sqlite3.connect(db_path)
cur = con.cursor()
cur.execute(
    "SELECT key, value FROM settings WHERE key LIKE '%pet%' OR key='first_run_done'"
)
for k, v in cur.fetchall():
    print(f"{k} = {v}")
con.close()
