// tsx runs esbuild with keepNames, which rewrites nested named functions as
// `__name(fn, "fn")` and relies on a module-level `__name` helper. Playwright
// serializes page functions with toString(), so that helper never reaches the
// browser and evaluation fails with `ReferenceError: __name is not defined`.
// Wrapping the source in a real function that declares a local `__name` keeps
// page functions working under tsx and in the production esbuild bundle.
const NAME_HELPER_SOURCE =
  'const __name = (target, value) => Object.defineProperty(target, "name", { value, configurable: true });';

export function toPageFunction<T extends (...args: never[]) => unknown>(fn: T): T {
  return new Function('...args', `${NAME_HELPER_SOURCE}\nreturn (${fn.toString()})(...args);`) as T;
}
