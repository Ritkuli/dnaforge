declare module 'metro4' {
  const content: any;
  export default content;
}

declare const $: any;
declare const Metro: any;

declare module 'edmonds-blossom-fixed' {
  const content: any;
  export default content;
}

declare module '*.htm' {
  const content: any;
  export default content;
}

type JSONValue = string | number | boolean | JSONObject | Array<JSONValue>;

interface JSONObject {
  [x: string]: JSONValue;
}
