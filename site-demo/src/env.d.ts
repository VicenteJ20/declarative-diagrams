declare module "*.diagram.yaml" { const svg: string; export default svg; export const narrow: string | null; }
declare module "*.diagram.json" { const svg: string; export default svg; export const narrow: string | null; }
declare module "*.theme.yaml" { const theme: import("@declarative-diagrams/core/themes").ThemeDef; export default theme; }
