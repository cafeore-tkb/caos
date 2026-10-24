import master from '../data/training-master.json';
import type { BeanCode } from '../types';

export const TRAINING_MASTER = master;
export const masterItem = (name: string) => master.items.find((item) => item.name === name);
export const itemType = (name: string) => master.item_types.find((type) => type.name === masterItem(name)?.item_type);
export const needsBrew = (name: string) => itemType(name)?.needs_brew === true;
export const seniorOnly = (name: string) => itemType(name)?.senior_only === true;
export const itemAbbr = (name: string) => masterItem(name)?.abbr ?? name;
export const itemPrice = (name: string) => {
  const link = master.menu_items.find((entry) => entry.item === name);
  return master.menus.find((menu) => menu.key === link?.menu)?.price ?? 0;
};
export const itemCode = (name: string): BeanCode => {
  if (name === 'アイスオレ') return 'MILK';
  if (name === '珈琲・俺ブレンド') return 'ORE';
  if (name === '余音ブレンド') return 'CHAMP';
  if (name === 'ケニア') return 'KEN';
  if (name === 'キリマン') return 'TNZ';
  if (name === 'ブラジル') return 'BRA';
  if (itemType(name)?.iced_brew) return 'ICE';
  return 'SP';
};
export const masterColor = (name: string, nominated = false) => {
  const screen = nominated ? 'nominated' : 'master';
  const type = masterItem(name)?.item_type;
  return (
    master.color_settings.find(
      (entry) => entry.screen === screen && entry.target_type === 'Item' && entry.target === name
    )?.color ??
    master.color_settings.find(
      (entry) => entry.screen === screen && entry.target_type === 'ItemType' && entry.target === type
    )?.color
  );
};
