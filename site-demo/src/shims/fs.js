// Browser stand-in for `node:fs`: the core library only touches the file system to find icon packs on disk,
// which do not exist in a page. Every read finds nothing; writes are refused.
const no = (what) => () => {
  throw new Error(`${what}: there is no file system in the browser`);
};
export const existsSync = () => false;
export const readdirSync = () => [];
export const readFileSync = no("readFileSync");
export const statSync = no("statSync");
export const mkdirSync = no("mkdirSync");
export const rmSync = no("rmSync");
export const writeFileSync = no("writeFileSync");
export default { existsSync, readdirSync, readFileSync, statSync, mkdirSync, rmSync, writeFileSync };
