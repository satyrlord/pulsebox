export function requiredElement<T extends Element>(
  root: ParentNode,
  selector: string,
  elementType: abstract new (...args: never[]) => T,
): T {
  const element = root.querySelector(selector);
  if (!(element instanceof elementType)) {
    throw new Error(`Pulsebox UI template is missing ${selector}.`);
  }
  return element;
}
