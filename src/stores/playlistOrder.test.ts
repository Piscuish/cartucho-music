import { beforeEach, describe, expect, it } from "vitest";
import { sortPlaylists, usePlaylistOrder } from "./playlistOrder";

const pl = (id: string) => ({ provider: "spotify" as const, id });
const keys = (xs: { id: string }[]) => xs.map((x) => x.id).join(",");

describe("orden de playlists", () => {
  beforeEach(() => usePlaylistOrder.setState({ pinned: [], order: [] }));

  it("fijadas arriba, luego orden manual y luego el del servicio", () => {
    const items = ["a", "b", "c", "d"].map(pl);
    expect(keys(sortPlaylists(items, ["spotify:c"], ["spotify:d"]))).toBe("c,d,a,b");
  });

  it("mueve una playlist antes de otra y lo recuerda", () => {
    const visible = ["a", "b", "c"].map((x) => `spotify:${x}`);
    usePlaylistOrder.getState().move("spotify:c", "spotify:a", visible);
    const { pinned, order } = usePlaylistOrder.getState();
    expect(keys(sortPlaylists(["a", "b", "c"].map(pl), pinned, order))).toBe("c,a,b");
  });

  it("fijar y desfijar", () => {
    usePlaylistOrder.getState().togglePin("spotify:b");
    expect(usePlaylistOrder.getState().pinned).toEqual(["spotify:b"]);
    usePlaylistOrder.getState().togglePin("spotify:b");
    expect(usePlaylistOrder.getState().pinned).toEqual([]);
  });

  it("reordena dentro de las fijadas", () => {
    usePlaylistOrder.setState({ pinned: ["spotify:a", "spotify:b"], order: [] });
    usePlaylistOrder.getState().move("spotify:b", "spotify:a", ["spotify:a", "spotify:b", "spotify:c"]);
    expect(usePlaylistOrder.getState().pinned).toEqual(["spotify:b", "spotify:a"]);
  });
});
