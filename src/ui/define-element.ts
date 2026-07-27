export function defineElement(name: string, constructor: CustomElementConstructor): void {
  if (customElements.get(name) === undefined) {
    customElements.define(name, constructor);
  }
}
