import { filter } from 'rxjs';

export function exclude<T>(predicate: (value: T) => boolean) {
  return filter<T>((value: T) => !predicate(value));
}
