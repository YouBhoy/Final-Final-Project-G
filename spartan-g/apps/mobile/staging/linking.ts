// The resolver permits this one import of the original route table, retaining all routes.
import { mobileLinking as original } from '../src/navigation/linking';
export const mobileLinking={...original,prefixes:['spartan-g-staging://']};
