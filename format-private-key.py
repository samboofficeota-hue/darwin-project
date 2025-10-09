#!/usr/bin/env python3
"""
GOOGLE_PRIVATE_KEY フォーマット変換ツール

使用方法:
  python3 format-private-key.py

このスクリプトは、Cloud Runの環境変数に設定する正しいフォーマットの
GOOGLE_PRIVATE_KEYを生成します。
"""

import json
import sys

def format_private_key_from_json(json_path='service-account-key.json'):
    """サービスアカウントキーJSONから秘密鍵を抽出して整形"""
    try:
        with open(json_path, 'r') as f:
            key = json.load(f)
        
        private_key = key.get('private_key')
        if not private_key:
            print("❌ Error: 'private_key' field not found in JSON file", file=sys.stderr)
            return None
        
        # \nを実際の改行に変換
        formatted_key = private_key.replace('\\n', '\n')
        
        return formatted_key
    
    except FileNotFoundError:
        print(f"❌ Error: File '{json_path}' not found", file=sys.stderr)
        return None
    except json.JSONDecodeError:
        print(f"❌ Error: Invalid JSON in '{json_path}'", file=sys.stderr)
        return None

def format_private_key_from_string(key_string):
    """文字列から秘密鍵を整形"""
    # \nを実際の改行に変換
    formatted_key = key_string.replace('\\n', '\n')
    
    # ダブルクォートを削除
    formatted_key = formatted_key.strip('"')
    
    return formatted_key

def validate_private_key(key):
    """秘密鍵のフォーマットを検証"""
    lines = key.split('\n')
    
    issues = []
    
    # ヘッダーチェック
    if not key.strip().startswith('-----BEGIN PRIVATE KEY-----'):
        issues.append("❌ ヘッダーが正しくありません（'-----BEGIN PRIVATE KEY-----'で始まる必要があります）")
    
    # フッターチェック
    if not key.strip().endswith('-----END PRIVATE KEY-----'):
        issues.append("❌ フッターが正しくありません（'-----END PRIVATE KEY-----'で終わる必要があります）")
    
    # 改行チェック
    if len(lines) < 3:
        issues.append("❌ 改行が不足しています（少なくとも3行必要：ヘッダー、本体、フッター）")
    
    # \nが残っていないかチェック
    if '\\n' in key:
        issues.append("⚠️  警告: エスケープされた改行（\\n）が含まれています")
    
    # 長さチェック
    if len(key) < 100:
        issues.append("❌ 秘密鍵が短すぎます")
    
    return issues

def main():
    print("=" * 60)
    print("GOOGLE_PRIVATE_KEY フォーマット変換ツール")
    print("=" * 60)
    print()
    
    # 方法1: JSONファイルから読み込み
    print("📁 方法1: サービスアカウントキーJSONファイルから読み込む")
    print("   ファイルパスを入力してください（空欄でスキップ）:")
    json_path = input("   > ").strip()
    
    formatted_key = None
    
    if json_path:
        formatted_key = format_private_key_from_json(json_path)
    else:
        # 方法2: 直接貼り付け
        print()
        print("📋 方法2: Cloud Runの現在の値を直接貼り付ける")
        print("   GOOGLE_PRIVATE_KEYの値を貼り付けてください:")
        print("   （複数行の場合は、最後に空行を入力してEnter）")
        print()
        
        lines = []
        while True:
            line = input()
            if line == "" and lines:
                break
            lines.append(line)
        
        key_string = '\n'.join(lines)
        formatted_key = format_private_key_from_string(key_string)
    
    if not formatted_key:
        print()
        print("❌ 秘密鍵の取得に失敗しました")
        return 1
    
    # 検証
    print()
    print("=" * 60)
    print("🔍 秘密鍵の検証")
    print("=" * 60)
    
    issues = validate_private_key(formatted_key)
    
    if issues:
        print()
        for issue in issues:
            print(issue)
        
        if any('❌' in issue for issue in issues):
            print()
            print("⚠️  重大な問題が見つかりました。秘密鍵が正しくない可能性があります。")
    else:
        print()
        print("✅ 秘密鍵のフォーマットは正しいようです")
    
    # 結果を表示
    print()
    print("=" * 60)
    print("📄 Cloud Runに設定する値")
    print("=" * 60)
    print()
    print("以下の内容をコピーして、Cloud Runの環境変数に貼り付けてください:")
    print()
    print("-" * 60)
    print(formatted_key)
    print("-" * 60)
    
    # ファイルに保存するかどうか
    print()
    save = input("この内容をファイルに保存しますか？ (y/N): ").strip().lower()
    
    if save == 'y':
        filename = 'google_private_key.txt'
        with open(filename, 'w') as f:
            f.write(formatted_key)
        print(f"✅ {filename} に保存しました")
        print(f"⚠️  セキュリティのため、使用後は必ず削除してください: rm {filename}")
    
    print()
    print("=" * 60)
    print("📝 次のステップ")
    print("=" * 60)
    print()
    print("1. Google Cloud Console にアクセス")
    print("   https://console.cloud.google.com/run")
    print()
    print("2. darwin-project サービスを選択")
    print()
    print("3. 「編集してデプロイ」をクリック")
    print()
    print("4. 「変数とシークレット」タブで GOOGLE_PRIVATE_KEY を編集")
    print()
    print("5. 上記の内容を貼り付け")
    print()
    print("6. 「デプロイ」をクリック")
    print()
    print("7. デプロイ完了後、文字起こしを再テスト")
    print()
    
    return 0

if __name__ == '__main__':
    sys.exit(main())

