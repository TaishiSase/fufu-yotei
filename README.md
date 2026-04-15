# 📅 夫婦の共有予定帳

パパ・ママ・琴音の予定を月・週カレンダーで一目で共有するファミリーカレンダーアプリです。

**URL:** https://fufu-yotei.vercel.app/

---

## 機能

### カレンダー
- **月表示 / 週表示** を切り替え可能
- 週表示は複数日にまたがる予定を**連続バー**で表示
- 今日ボタンで即座に現在週へ移動

### 予定管理
- 予定の追加・編集・削除
- メンバー別に色分け表示（みんな・パパ・ママ・琴音）
- 種別プリセット（在宅 / 早朝出社 / 出社 / 遅晩出社 / 出張 / 飲み会 / 保育園イベント / 会社休み / カスタム）
- 時間帯指定（終日 / 午前 / 午後 / 仕事終わり / 時刻指定）
- 複数日またぎ対応（出張など）
- 確認済みフラグ（確認済みの予定は太い枠線で表示）

### フィルター
| フィルター | 表示内容 |
|---|---|
| みんな | 全員の公開予定 |
| 🔒 パパ | みんなの予定 ＋ パパのプライベート予定 |
| 🔒 ママ | みんなの予定 ＋ ママのプライベート予定 |

プライベートフィルターはパスワード認証付き（7日間ローカル保持）

### カレンダー自動同期（Jorte / Googleカレンダー）
iCal形式でカレンダーアプリに自動同期できます：

| フィルター | iCal URL |
|---|---|
| みんな | `https://fufu-yotei.vercel.app/api/calendar?filter=all` |
| パパ | `https://fufu-yotei.vercel.app/api/calendar?filter=papa&token=<パスワード>` |
| ママ | `https://fufu-yotei.vercel.app/api/calendar?filter=mama&token=<パスワード>` |

---

## 技術スタック

| 項目 | 内容 |
|---|---|
| フロントエンド | HTML / CSS / Vanilla JavaScript |
| バックエンド (DB) | [Supabase](https://supabase.com/)（PostgreSQL） |
| ホスティング | [Vercel](https://vercel.com/) |
| iCal API | Vercel Serverless Function（`api/calendar.js`） |
| フォント | Noto Sans JP / Zen Maru Gothic（Google Fonts） |

---

## ファイル構成

```
fufu-yotei/
├── index.html        # アプリ本体
├── styles.css        # スタイル
├── script.js         # アプリロジック
├── api/
│   └── calendar.js   # iCal生成サーバーレス関数
├── vercel.json       # Vercelデプロイ設定
└── package.json      # npm依存関係（@supabase/supabase-js）
```

---

## Supabaseテーブル構成

### `schedules` テーブル

| カラム | 型 | 説明 |
|---|---|---|
| `id` | uuid | 主キー |
| `date` | date | 開始日 |
| `date_end` | date | 終了日（複数日の場合） |
| `member` | text | `all` / `papa` / `mama` / `kotone` |
| `event_type` | text | 種別（在宅 / 出社 / 出張 など） |
| `event_label` | text | カスタム種別のラベル |
| `time_type` | text | `all_day` / `morning` / `afternoon` / `evening` / `custom` |
| `time_start` | text | カスタム開始時刻 |
| `time_end` | text | カスタム終了時刻 |
| `is_private` | text | `null`（公開）/ `papa_private` / `mama_private` |
| `confirmed` | boolean | 確認済みフラグ |

---

## カラー仕様

| メンバー | カラー |
|---|---|
| みんな | `#3A9B77`（グリーン） |
| パパ | `#5BA3D0`（ブルー） |
| ママ | `#E8748A`（ピンク） |
| 琴音 | `#E8782A`（オレンジ） |

---

## ローカル開発

1. `config.json`（または直接 `script.js`）に Supabase の URL と anon key を設定
2. ブラウザで `index.html` を開く（Vercel デプロイ前の確認用）
3. iCal API のテストは `vercel dev` で Vercel CLI を使用

---

## デプロイ

GitHub の `main` ブランチにプッシュすると Vercel が自動デプロイします。
