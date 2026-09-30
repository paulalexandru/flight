// Sunet distinct pentru fiecare tip de lovitură: "tap" simplu de lemn la
// ratare, ciocan metalic la lovirea corpului unui avion, plus un sunet
// special, mai puternic (impact + ping metalic), redat exact atunci când e
// lovit capul avionului ("head") - lovitura care îl scoate definitiv din joc.
//
// Fișierele sunt deja clipuri scurte, deci le redăm integral, fără nicio
// tăiere manuală. Folosim un mic pool de elemente <audio> reutilizate (în loc
// de a crea unul nou de fiecare dată sau de a face cloneNode), ca redările
// rapide/succesive să nu se blocheze una pe alta.

import moveUrl from "../assets/sounds/move.wav";
import hitBodyUrl from "../assets/sounds/metal-hammer-hit.mp3";
import hitHeadUrl from "../assets/sounds/hit-head.wav";
import crowdLoseUrl from "../assets/sounds/crowd-lose.mp3";
import victoryTrumpetUrl from "../assets/sounds/victory-trumpet.mp3";

type ShotResultLike = "hit" | "miss" | "sunk" | "head";

const VOLUME = 0.4;
const HIT_BODY_VOLUME = 0.5;
const HEAD_VOLUME = 0.55;
const POOL_SIZE = 6;

let pool: HTMLAudioElement[] = [];
let poolIndex = 0;
let hitBodyPool: HTMLAudioElement[] = [];
let hitBodyPoolIndex = 0;
let headPool: HTMLAudioElement[] = [];
let headPoolIndex = 0;

function getPool(): HTMLAudioElement[] {
  if (typeof Audio === "undefined") return [];
  if (pool.length === 0) {
    pool = Array.from({ length: POOL_SIZE }, () => {
      const audio = new Audio(moveUrl);
      audio.preload = "auto";
      audio.volume = VOLUME;
      return audio;
    });
  }
  return pool;
}

function getHitBodyPool(): HTMLAudioElement[] {
  if (typeof Audio === "undefined") return [];
  if (hitBodyPool.length === 0) {
    hitBodyPool = Array.from({ length: POOL_SIZE }, () => {
      const audio = new Audio(hitBodyUrl);
      audio.preload = "auto";
      audio.volume = HIT_BODY_VOLUME;
      return audio;
    });
  }
  return hitBodyPool;
}

function getHeadPool(): HTMLAudioElement[] {
  if (typeof Audio === "undefined") return [];
  if (headPool.length === 0) {
    headPool = Array.from({ length: POOL_SIZE }, () => {
      const audio = new Audio(hitHeadUrl);
      audio.preload = "auto";
      audio.volume = HEAD_VOLUME;
      return audio;
    });
  }
  return headPool;
}

/** Sunetul redat exclusiv la o mutare ratată ("miss"). */
export function playMoveSound() {
  const instances = getPool();
  if (instances.length === 0) return;
  const audio = instances[poolIndex];
  poolIndex = (poolIndex + 1) % instances.length;
  audio.currentTime = 0;
  audio.play().catch(() => {
    // Browserul poate refuza redarea automată dacă utilizatorul nu a
    // interacționat încă deloc cu pagina - ignorăm eroarea, nu e critică.
  });
}

/** Sunetul redat când e lovit corpul unui avion ("hit"/"sunk", fără cap). */
export function playHitBodySound() {
  const instances = getHitBodyPool();
  if (instances.length === 0) return;
  const audio = instances[hitBodyPoolIndex];
  hitBodyPoolIndex = (hitBodyPoolIndex + 1) % instances.length;
  audio.currentTime = 0;
  audio.play().catch(() => {
    // Browserul poate refuza redarea automată - ignorăm eroarea.
  });
}

/** Sunetul special redat exact când e lovit capul unui avion. */
export function playHeadHitSound() {
  const instances = getHeadPool();
  if (instances.length === 0) return;
  const audio = instances[headPoolIndex];
  headPoolIndex = (headPoolIndex + 1) % instances.length;
  audio.currentTime = 0;
  audio.play().catch(() => {
    // Browserul poate refuza redarea automată - ignorăm eroarea.
  });
}

export function playShotSound(result: ShotResultLike) {
  if (result === "head") {
    playHeadHitSound();
    return;
  }
  if (result === "miss") {
    playMoveSound();
    return;
  }
  playHitBodySound();
}

// Sunete de public redate la finalul jocului: aplauze/urale ("ieiii") la
// victorie, oftat dezamăgit ("oooo"/"aaaa") la înfrângere. Elemente <audio>
// separate, de unică folosință, fiindcă se redau o singură dată per meci.
const END_GAME_VOLUME = 0.5;

function playOneShot(url: string) {
  if (typeof Audio === "undefined") return;
  const audio = new Audio(url);
  audio.volume = END_GAME_VOLUME;
  audio.play().catch(() => {
    // Browserul poate refuza redarea automată - ignorăm eroarea.
  });
}

/** Redă sunetul de public dezamăgit ("oooo"/"aaaa") când jucătorul pierde meciul. */
export function playCrowdLoseSound() {
  playOneShot(crowdLoseUrl);
}

/** Redă un clopoțel de "achievement" la victorie - singurul sunet folosit
 * pentru momentul de câștig. */
export function playVictoryTrumpetSound() {
  playOneShot(victoryTrumpetUrl);
}
