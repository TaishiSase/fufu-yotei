# 夫婦の共有予定帳

## アプリ概要
佐瀬家（パパ・ママ・琴音）の予定を共有するWebアプリ。月カレンダーで確認・追加・編集。リマインド通知（Web Push）、画像添付、プライベートモード機能あり。

- 本番URL: Vercel（GitHubプッシュで自動デプロイ）
- GitHub: https://github.com/TaishiSase/fufu-yotei

## 技術スタック
- フロントエンド: HTML + CSS + Vanilla JS（フレームワークなし）
- DB: Supabase（PostgreSQL + Storage）
- ホスティング: Vercel
- 認証: Supabase Auth
- プッシュ通知: Web Push API（VAPID）
- Cron: Vercel Cron（毎朝7時JST）

## ファイル構成
```
index.html      ← HTML（モーダル・カレンダー・各種UI）
script.js       ← 全ロジック
styles.css      ← 全スタイル
config.json     ← Supabase接続情報 + VAPIDPublicKey
manifest.json   ← PWA設定
sw.js           ← Service Worker（プッシュ通知受信）
api/
  calendar.js   ← iCal出力エンドポイント
  remind.js     ← リマインド送信Cron（毎朝7時JST）
vercel.json     ← cron設定（hourly）
package.json    ← web-push依存
```

## Supabaseスキーマ

### schedules（予定）
| カラム | 型 | 備考 |
|---|---|---|
| id | UUID PK | |
| date | DATE | 開始日 |
| date_end | DATE | 終了日（日またぎ時のみ） |
| member | text | all / papa / mama / kotone |
| event_type | text | 予定の種類（出社/出張/通院など） |
| event_label | text | カスタム種別のテキスト |
| time_type | text | all_day / morning / afternoon / evening / custom |
| time_start | text | カスタム開始時刻 |
| time_end | text | カスタム終了時刻 |
| is_private | text | null / papa_private / mama_private |
| office_location | text | 出社先 |
| trip_destination | text | 出張先 |
| return_time | text | 帰宅予想時刻 |
| needs_dinner | boolean | 晩飯いるか |
| place | text | 場所（任意） |
| confirmed | boolean | 確認済みフラグ |
| confirmed_at | TIMESTAMP | |
| wants_discussion | boolean | |
| comment | text | |
| image_urls | text[] DEFAULT '{}' | 添付画像URL配列 |
| reminder_enabled | boolean DEFAULT false | リマインド有効 |
| reminder_targets | text[] DEFAULT '{}' | 通知先（papa/mama/both） |
| reminder_timing | text[] DEFAULT '{prev_day}' | 通知タイミング |
| created_at / updated_at | TIMESTAMP | |

### push_subscriptions（Web Push購読情報）
| カラム | 型 | 備考 |
|---|---|---|
| id | UUID PK | |
| member | text | papa / mama |
| subscription | JSONB | PushSubscriptionオブジェクト |
| created_at / updated_at | TIMESTAMP | |

### Storageバケット
- `schedule-images`（PUBLIC）: 予定添付画像

## 主要機能
1. **月カレンダー**: 予定をカラーバッジで表示、メンバーフィルタあり
2. **予定追加/編集モーダル**: 開始日・終了日（日またぎ）・メンバー・種別・時間・場所・画像・リマインド
3. **プライベートモード**: PINコードでパパ/ママのプライベート予定を表示（PIN: パパ=0728, ママ=0804）
4. **画像添付**: Canvas圧縮 → Supabase Storage upload（複数枚可）
5. **リマインド通知**: 前日夜・当日朝・1時間前の3種類、Service Worker経由
6. **iCalフィード**: `/api/calendar` エンドポイントでiCal出力

## 認証
- Supabase Authのメール＋パスワードで認証
- パパ: `taish.dengel@gmail.com` / ママ: `vv8.shk.4ill@hotmail.co.jp`

## Vercel環境変数
- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_EMAIL`
- `SUPABASE_URL`
- `SUPABASE_KEY`

## 開発規約
- JSはVanilla JS、フレームワーク不使用
- スタイルはCSS変数でテーマ管理（`--accent`, `--bg`, `--text`等）
- 予定追加/編集は同一モーダルを使い回す（`editingSchedule` 変数で判定）
- `addDate` 変数が開始日の状態管理の中心（`dateStartInput` の値と同期）
