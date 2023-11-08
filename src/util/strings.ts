export const trimIndent = (str: string): string => {
  return str.replace(/^ +/gm, '');
};

export const truncate = (str: string, n: number) => {
  return str.length > n ? str.slice(0, n - 3) + '...' : str;
};

export const isBlank = (str: string) => {
  return !str || /^\s*$/.test(str);
};

export const isNotBlank = (str: string) => !isBlank(str);

export const appendIfNotMax = (str: string, append: string, max: number): string => {
  const sum = str.length + append.length;
  if (sum < max) {
    return str + append;
  }
  return str;
};

export const truncateParagraph = (str: string, n: number): string => {
  return dropNotParagraph(truncate(str, n).trim());
};

export const dropNotParagraph = (str: string): string => {
  const lastChar = str.charAt(str.length - 1);
  if (!(lastChar === '.' || lastChar === '\n')) {
    return dropLastWhile(str, (x) => x !== '\n');
  }
  return str;
};

export const dropLastWhile = (array: string, predicate: (el: string) => boolean): string => {
  let offset = array.length;
  while (0 < offset && predicate(array[offset - 1])) offset--;
  return array.slice(0, offset);
};

export const charCount = (str: string, char: string): number => {
  return str.split(char).length - 1;
};

export const titleCase = (str: string): string => {
  // https://stackoverflow.com/a/32589289
  // Modified for enums, won't work with usual things that have underscores.
  var splitStr = str.toLowerCase().replaceAll('_', ' ').split(' ');
  for (var i = 0; i < splitStr.length; i++) {
    // You do not need to check if i is larger than splitStr length, as your for does that for you
    // Assign it back to the array
    splitStr[i] = splitStr[i].charAt(0).toUpperCase() + splitStr[i].substring(1);
  }
  // Directly return the joined string
  return splitStr.join(' ');
};

// Naive html to markdown converter, turndown doesn't work in service workers
export const htmlToMarkdown = (str: string): string => {
  // Decode str
  str = decodeURI(str);

  // Replace a href links
  const matches = str.matchAll(/<a href="(.*?)">(.*?)<\/a>/gm);
  for (const match of matches) {
    const origStr = match[0];
    const link = match[1];
    const label = match[2];
    const markdown = `[${label}](${link})`;
    str = str.replace(origStr, markdown);
  }

  // Replace common html tags
  return str
    .replaceAll('<b>', '**')
    .replaceAll('</b>', '**')
    .replaceAll('<em>', '_')
    .replaceAll('</em>', '_')
    .replaceAll('<u>', '__')
    .replaceAll('</u>', '__')
    .replaceAll('<i>', '*')
    .replaceAll('</i>', '*')
    .replaceAll('<br>', '\n')
    .replaceAll('</br>', '\n');
};
