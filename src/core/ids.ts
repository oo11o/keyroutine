// Identity, separated from naming. A routine's id and an action's id used to
// be derived from what they were called — a slug of the routine's name, and
// for an action the very name its result was read back by ($<id>). That made
// two different things one thing: renaming meant re-identifying, and an id
// could not be used as a stable handle because it moved whenever a user tidied
// a name up.
//
// Ids are now opaque and permanent. Nothing user-facing reads them, nothing in
// the builder edits them, and a name can be changed as often as the user likes
// without anything else in the config having to follow.

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

// Eight base-36 characters — 36^8, about 2.8e12, against the handful of ids a
// config holds. Random rather than a counter: ids from two configs merged by
// hand (an import pasted next to what is already there) must not collide, and
// a counter restarts at 1 in every file.
export function newId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const byte of bytes) out += ALPHABET[byte % ALPHABET.length];
  return out;
}

// An id that is free in a set, which only matters for the vanishing case of a
// collision and for tests that stub the generator.
export function freshId(taken: Set<string>): string {
  for (;;) {
    const id = newId();
    if (!taken.has(id)) return id;
  }
}
