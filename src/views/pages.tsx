import { daysLeftLabel, itemStatus } from "../domain/status";
import type { Item } from "../domain/schema";

const kindLabel = { best_by: "賞味期限", use_by: "消費期限" } as const;

type ListedItem = Item & { days_left: number };

export const ItemList = (props: { items: ListedItem[]; warnDays: number; lostSpace: boolean }) => (
  <>
    <header>
      <h1>期限メモ</h1>
      <a href="/settings">設定</a>
    </header>
    {props.lostSpace ? (
      <p class="notice" role="alert">
        この端末で使っていた一覧が見つかりません。共有URLが作り直された可能性があります。共有している人から新しい共有URLを受け取って開いてください（このまま追加すると別の新しい一覧になります）。
      </p>
    ) : null}
    <p>
      <a class="button" href="/items/new">
        ＋ 追加
      </a>
    </p>
    {props.items.length === 0 ? (
      <p>まだ登録がありません。</p>
    ) : (
      <ul class="items">
        {props.items.map((item) => (
          <li class={`item ${itemStatus(item.days_left, props.warnDays)}`}>
            <a class="name" href={`/items/${item.id}/edit`}>
              {item.name}
            </a>
            <span class="meta">
              {kindLabel[item.kind]} {item.expires_on}
            </span>
            <span class="days">{daysLeftLabel(item.days_left)}</span>
            <button class="delete secondary" type="button" popovertarget={`delete-${item.id}`}>
              削除
            </button>
            {/* popover 属性で JS なしに確認ダイアログを出す（要件 4.3） */}
            <div popover="auto" id={`delete-${item.id}`}>
              <p>「{item.name}」を削除しますか？</p>
              <form class="actions" method="post" action={`/items/${item.id}/delete`}>
                <button class="danger">削除する</button>
                <button
                  class="secondary"
                  type="button"
                  popovertarget={`delete-${item.id}`}
                  popovertargetaction="hide"
                >
                  やめる
                </button>
              </form>
            </div>
          </li>
        ))}
      </ul>
    )}
  </>
);

type ItemFormValues = Partial<Record<"name" | "expires_on" | "kind" | "memo", string>>;
export type ItemField = keyof ItemFormValues;

const errorMessages: Record<ItemField, string> = {
  name: "商品名を 100 文字以内で入力してください",
  expires_on: "期限日を正しく入力してください",
  kind: "種別を選んでください",
  memo: "メモは 500 文字以内で入力してください",
};

const FieldError = (props: { field: ItemField; errors: ReadonlySet<ItemField> }) =>
  props.errors.has(props.field) ? (
    <span class="error" id={`${props.field}-error`}>
      {errorMessages[props.field]}
    </span>
  ) : null;

export const ItemForm = (props: {
  title: string;
  action: string;
  values: ItemFormValues;
  errors: ReadonlySet<ItemField>;
}) => {
  const { values, errors } = props;
  const invalid = (field: ItemField) =>
    errors.has(field) ? { "aria-invalid": true, "aria-describedby": `${field}-error` } : {};
  return (
    <>
      <h1>{props.title}</h1>
      <form method="post" action={props.action}>
        {/* /extract.js が表示する。JS が無ければ手入力だけ（ADR 0003） */}
        <p id="photo" hidden>
          <label for="photo-input">写真から読み取る</label>
          <input id="photo-input" type="file" accept="image/*" capture="environment" />
          <span id="photo-status" role="status" />
        </p>
        {/* 期限が読めなかったとき、期限の部分を囲んで再読する（ADR 0007） */}
        <div id="crop" hidden>
          <canvas id="crop-canvas" aria-label="撮った写真。期限の部分を指でなぞって囲む" />
          <p class="actions">
            <button type="button" id="crop-read" disabled>
              囲んだ部分を読み取る
            </button>
            <button type="button" id="crop-cancel" class="secondary">
              やめる
            </button>
          </p>
        </div>
        <p>
          <label for="name">商品名</label>
          <input
            id="name"
            name="name"
            required
            maxlength={100}
            value={values.name}
            list="name-candidates"
            {...invalid("name")}
          />
          {/* 読み取りで商品名を決めきれなかったときの候補（/extract.js が入れる） */}
          <datalist id="name-candidates" />
          <FieldError field="name" errors={errors} />
        </p>
        <p>
          <label for="expires_on">期限日</label>
          <input
            id="expires_on"
            name="expires_on"
            type="date"
            required
            value={values.expires_on}
            {...invalid("expires_on")}
          />
          <FieldError field="expires_on" errors={errors} />
        </p>
        <fieldset {...invalid("kind")}>
          <legend>種別</legend>
          {(["best_by", "use_by"] as const).map((kind) => (
            <label>
              <input
                type="radio"
                name="kind"
                value={kind}
                required
                checked={(values.kind ?? "best_by") === kind}
              />
              {kindLabel[kind]}
            </label>
          ))}
          <FieldError field="kind" errors={errors} />
        </fieldset>
        <p>
          <label for="memo">メモ（任意）</label>
          <textarea id="memo" name="memo" maxlength={500} rows={3} {...invalid("memo")}>
            {values.memo}
          </textarea>
          <FieldError field="memo" errors={errors} />
        </p>
        <p class="actions">
          <button>保存</button>
          <a class="button secondary" href="/">
            戻る
          </a>
        </p>
      </form>
      <script src="/extract.js" defer />
    </>
  );
};

export const Settings = (props: {
  warnDays: string;
  invalid: boolean;
  shareUrl: string | undefined;
}) => (
  <>
    <h1>設定</h1>
    <form method="post" action="/settings">
      <p>
        <label for="warn_days">期限間近（黄色）にする日数</label>
        <input
          id="warn_days"
          name="warn_days"
          type="number"
          inputmode="numeric"
          min={1}
          max={30}
          required
          value={props.warnDays}
          {...(props.invalid
            ? { "aria-invalid": true, "aria-describedby": "warn_days-error" }
            : {})}
        />
        {props.invalid ? (
          <span class="error" id="warn_days-error">
            1〜30 の整数で入力してください
          </span>
        ) : null}
      </p>
      <p class="actions">
        <button>保存</button>
        <a class="button secondary" href="/">
          戻る
        </a>
      </p>
    </form>
    <h2>共有URL</h2>
    {props.shareUrl === undefined ? (
      <p>商品を登録すると共有URLが表示されます。</p>
    ) : (
      <ShareUrl url={props.shareUrl} />
    )}
  </>
);

const ShareUrl = (props: { url: string }) => (
  <>
    <p>
      このURLを開いた端末で同じ一覧を使えます（家族との共有・機種変更）。URLを知っている人は誰でも見られるので、共有する相手にだけ送ってください。
    </p>
    <p>
      <label for="share-url">共有URL</label>
      <input id="share-url" readonly value={props.url} />
    </p>
    {/* Clipboard API が使えるときだけ /app.js が表示する。使えなければ URL を長押しでコピーする */}
    <p class="actions">
      <button id="share-copy" type="button" hidden>
        コピー
      </button>
      <span id="share-status" role="status" />
    </p>
    <p>
      <button class="secondary" type="button" popovertarget="rotate">
        共有URLを作り直す
      </button>
    </p>
    <div popover="auto" id="rotate">
      <p>
        今の共有URLは使えなくなり、共有している端末では新しいURLを開き直すまで一覧が見られなくなります。作り直しますか？
      </p>
      <form class="actions" method="post" action="/settings/rotate">
        <button class="danger">作り直す</button>
        <button class="secondary" type="button" popovertarget="rotate" popovertargetaction="hide">
          やめる
        </button>
      </form>
    </div>
  </>
);

export const InvalidShareUrl = () => (
  <>
    <h1>共有URLが使えません</h1>
    <p>
      作り直されたか、URLが間違っている可能性があります。共有している人から新しい共有URLを受け取って開いてください。
      <a href="/">一覧へ戻る</a>
    </p>
  </>
);

export const NotFound = () => (
  <>
    <h1>見つかりません</h1>
    <p>
      削除されたか、別のスペースの商品です。<a href="/">一覧へ戻る</a>
    </p>
  </>
);
