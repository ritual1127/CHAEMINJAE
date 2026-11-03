// 곡 합성 전용 Worker: game.js의 renderPCM을 화면 밖에서 돌리고, 소리 배열을 복사 없이 넘겨준다
import { renderPCM } from './game.js';

onmessage = ({ data: { id, song } }) => {
  try {
    const pcm = renderPCM(song);
    postMessage({ id, pcm }, pcm.map((a) => a.buffer));
  } catch (e) {
    postMessage({ id, error: String(e?.message ?? e) });
  }
};
