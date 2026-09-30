import { describe, expect, it } from "vitest";

import { FakeRepository } from "../src/fakeRepository.js";
import { OptionsFetcher } from "../src/optionsFetcher.js";
import { RepositoryRegistry, type RepositoryQuery } from "../src/repository.js";

/**
 * 選択肢の取り寄せ（`optionsSource`）。Flutter 版の `_OptionsFetcher` と同じ規則であること。
 * 0.9.22 までブラウザ版は読んでおらず、同梱の例の「マスタから引く」欄が空で出ていた。
 */
class Counting extends FakeRepository {
  readonly asked: RepositoryQuery[] = [];
  override async search(query: RepositoryQuery) {
    this.asked.push(query);
    return super.search(query);
  }
}

const cities = () =>
  new Counting(
    [
      { code: "shibuya", name: "渋谷区", prefecture: "tokyo", zip: "150" },
      { code: "kita", name: "北区", prefecture: "osaka", zip: "530" },
    ],
    ["code"],
  );

const city = {
  field: "city",
  options: [],
  optionsFrom: "prefecture",
  optionsSource: {
    repository: "cityRepository",
    value: "code",
    label: "name",
    parentKey: "prefecture",
    limit: 200,
    copy: { zipCode: "zip" },
  },
};

const settle = () => new Promise((done) => setTimeout(done, 0));

describe("OptionsFetcher", () => {
  it("親の値で引いて、同じ親のままなら1回だけ", async () => {
    const repo = cities();
    const fetcher = new OptionsFetcher(new RepositoryRegistry({ cityRepository: repo }));
    let told = 0;
    fetcher.subscribe(() => told++);

    expect(fetcher.optionsFor(city, { prefecture: "osaka" })).toEqual([]); // 引けるまでは空
    await settle();
    expect(fetcher.optionsFor(city, { prefecture: "osaka" })).toEqual([{ value: "kita", label: "北区" }]);
    expect(told).toBe(1);
    expect(repo.asked).toHaveLength(1);
    expect(repo.asked[0].filters).toEqual({ prefecture: "osaka" });
  });

  it("親を見る指定なのに親が空なら引かない", async () => {
    const repo = cities();
    const fetcher = new OptionsFetcher(new RepositoryRegistry({ cityRepository: repo }));
    fetcher.optionsFor(city, {});
    await settle();
    expect(repo.asked).toHaveLength(0);
  });

  it("選んだ値の元の行を返す（写す元）", async () => {
    const fetcher = new OptionsFetcher(new RepositoryRegistry({ cityRepository: cities() }));
    fetcher.optionsFor(city, { prefecture: "tokyo" });
    await settle();
    expect(fetcher.rowFor(city, { prefecture: "tokyo" }, "shibuya")?.zip).toBe("150");
    expect(fetcher.rowFor(city, { prefecture: "tokyo" }, "kita")).toBeUndefined();
    expect(fetcher.rowFor(city, { prefecture: "tokyo" }, null)).toBeUndefined();
  });

  it("定義に書いた選択肢はそのまま（取り寄せない）", () => {
    const fetcher = new OptionsFetcher();
    const owner = { field: "kind", options: [{ value: "a", label: "A" }] };
    expect(fetcher.optionsFor(owner, {})).toEqual([{ value: "a", label: "A" }]);
  });

  it("登録されていない Repository は空（画面は出る）", async () => {
    const fetcher = new OptionsFetcher(new RepositoryRegistry({}));
    expect(fetcher.optionsFor(city, { prefecture: "tokyo" })).toEqual([]);
    await settle();
    expect(fetcher.optionsFor(city, { prefecture: "tokyo" })).toEqual([]);
  });
});
