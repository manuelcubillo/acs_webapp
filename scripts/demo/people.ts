/**
 * Invented residents for the demo tenant.
 *
 * Every name here is fictional and combined deterministically from two pools,
 * so the set is stable between runs and large enough that no pair repeats
 * across the personal cards the seed issues. Guest passes carry no name.
 */

import { intBetween, pick, shuffled, type Rng } from "./random";

const FIRST_NAMES = [
  "Lucía", "Martín", "Sofía", "Hugo", "Paula", "Mateo", "Valeria", "Leo",
  "Daniela", "Adrián", "Alba", "Pablo", "Carmen", "Diego", "Nerea", "Álvaro",
  "Irene", "Javier", "Marta", "Rubén", "Elena", "Sergio", "Andrea", "Iván",
  "Claudia", "Óscar", "Rocío", "Guillermo", "Teresa", "Ignacio", "Beatriz",
  "Raúl", "Sandra", "Andrés", "Patricia", "Jorge", "Silvia", "Manuel", "Cristina",
  "Alejandro", "Natalia", "Fernando", "Lorena", "Ricardo", "Miriam", "Emilio",
  "Julia", "Gonzalo", "Ainhoa", "Tomás",
] as const;

const SURNAMES = [
  "Vidal", "Serrano", "Moreno", "Cabrera", "Iglesias", "Peralta", "Bermúdez",
  "Ferrer", "Quintana", "Salazar", "Montes", "Escudero", "Roldán", "Nogales",
  "Arroyo", "Bautista", "Cifuentes", "Delgado", "Esteban", "Fuentes", "Gallardo",
  "Herrero", "Izquierdo", "Jaén", "Lozano", "Mendoza", "Navarrete", "Olmedo",
  "Pardo", "Quesada", "Rivas", "Sanchís", "Tejedor", "Ureña", "Vargas",
  "Zamora", "Barrios", "Casal", "Duarte", "Espinosa",
] as const;

export interface Person {
  name: string;
  surname: string;
  /** Stable seed for the avatar service, derived from the name. */
  avatarSeed: string;
}

/**
 * Build `count` unique people. Uniqueness is on the full name, so the two card
 * types never issue a card to the same invented person.
 */
export function buildPeople(rng: Rng, count: number): Person[] {
  const firsts = shuffled(rng, FIRST_NAMES);
  const lasts = shuffled(rng, SURNAMES);
  const seen = new Set<string>();
  const people: Person[] = [];

  let guard = 0;
  while (people.length < count && guard < count * 50) {
    guard++;
    const name = firsts[(people.length + guard) % firsts.length];
    const surname = `${pick(rng, lasts)} ${pick(rng, lasts)}`;
    const full = `${name} ${surname}`;
    if (seen.has(full)) continue;
    seen.add(full);
    people.push({
      name,
      surname,
      avatarSeed: slugSeed(full),
    });
  }

  if (people.length < count) {
    throw new Error(`Could not build ${count} unique names (got ${people.length}).`);
  }
  return people;
}

/** ASCII-only, hyphenated seed — the avatar service keys its output on it. */
function slugSeed(full: string): string {
  return full
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** A plausible dwelling: floor 1-8, door A-D. */
export function buildDwelling(rng: Rng): { floor: number; letter: string } {
  return {
    floor: intBetween(rng, 1, 8),
    letter: pick(rng, ["A", "B", "C", "D"] as const),
  };
}
