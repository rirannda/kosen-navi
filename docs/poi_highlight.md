# POIのハイライト

`Map.svelte` のコンポーネント参照から、POI IDを指定して呼び出します。

```svelte
<script lang="ts">
	import Map from '$lib/components/Map.svelte';
	import type { HighlightColor, Poi } from '$lib';

	let selectedPoi = $state<Poi | null>(null);

	let mapComponent:
		| {
				highlightPoiById: (poiId: string, color?: HighlightColor) => boolean;
				clearPoiHighlight: (color?: HighlightColor) => void;
		  }
		| undefined;
</script>

<Map bind:this={mapComponent} bind:selectedPoi />
<p>選択中: {selectedPoi?.name ?? '未選択'}</p>
<button onclick={() => mapComponent?.highlightPoiById('poi_hr_1-1', 'start')}>1-1HRを表示</button>
<button onclick={() => mapComponent?.clearPoiHighlight('selected')}>選択だけを解除</button>
<button onclick={() => mapComponent?.clearPoiHighlight()}>ハイライトを解除</button>
```

`highlightPoiById(poiId, color = 'selected')` は `pois` の `nodeId` から建物・階を特定し、その階のSVG内にある
`svgId` の要素へ `poi-highlight` クラスを追加します。対応する階へ切り替えて移動し、
図形の中心に `name` の吹き出しを表示します。

第2引数は色と役割を指定します。省略時は `selected` です。

| 名前       | 色  | 用途       |
| ---------- | --- | ---------- |
| `start`    | 緑  | スタート   |
| `goal`     | 赤  | ゴール     |
| `selected` | 黄  | 通常の選択 |

色の定義は `src/lib/map/highlightColors.ts` にあり、`$lib` から `highlightColors` と
`HighlightColor` 型を参照できます。塗り・枠線・吹き出しの文字色をまとめて変更できます。

`start`・`goal`・`selected` の3枠に、それぞれ最大1部屋だけ保持できます。最大3部屋を
同時にハイライトし、同じ枠に別のPOIを指定すると、その枠の古い部屋だけを解除します。
未定義の役割は受け付けません。

```ts
mapComponent?.highlightPoiById('poi_hr_1-1', 'start');
mapComponent?.highlightPoiById('poi_hr_1-2', 'goal');
mapComponent?.highlightPoiById('poi_hr_1-3', 'selected');
```

同じ部屋が複数の枠を兼ねる場合は、ハイライトと吹き出しを1つにまとめます。
色は `selected`、`goal`、`start` の順で優先し、優先されている枠を解除すると残る枠の色へ戻ります。
階を切り替えて対象のSVGが非表示になると、その部屋の吹き出しも隠れ、対象の階へ戻ると再表示されます。

建物内のPOIに対応するSVGをタップすると、黄色のハイライトと吹き出しを表示し、
`selectedPoi` に該当する `Poi` オブジェクトを登録します。親から `bind:selectedPoi` で参照でき、
`selectedPoi.id`、`selectedPoi.name`、`selectedPoi.nodeId` などを利用できます。
タップでは地図の位置・ズームを維持します。グループの子要素をタップした場合も親のPOIを選び、
POIが紐づいていない図形や別の階にある同名のSVGでは選択を変更しません。
キーボードのEnter・Spaceでも選択できます。

タップは `selected` 枠だけを置き換え、スタートとゴールのハイライトを維持します。
`highlightPoiById(poiId, 'selected')` が成功した場合も `selectedPoi` が更新されます。
`start`・`goal` を指定した呼び出しでは、選択中のPOIを変更しません。
`clearPoiHighlight('selected')` で選択だけを解除し、`selectedPoi` を `null` に戻します。
`clearPoiHighlight('start')`・`clearPoiHighlight('goal')` は各枠だけを解除し、
引数なしの `clearPoiHighlight()` は3枠すべてを解除します。階を切り替えても各枠のPOIは維持します。

戻り値は表示を受け付けた場合に `true`、色名・POI・ノード・対応するSVG要素が見つからない場合に
`false` です。失敗時は現在のハイライトを維持します。地図の初期化前は枠ごとに
最新の呼び出しを予約して `true` を返し、SVGの読み込み後に表示します。
予約も同じ枠ごとの制限を適用し、`clearPoiHighlight()` で解除できます。

`showRoute(startId, goalId)` はスタート地点に緑の `S` マーク、ゴール地点に赤の旗を表示します。
マークは各地点の階で表示され、経路を再表示・解除した際は古いマークも解除されます。
始点と終点が同じ場合は `S/G` の共通マークを表示します。
