// Pick uniformly from all combinations, excluding the previous one when possible.
export function randomOutfit(choices, previous = {}, random = Math.random) {
  const categories = Object.keys(choices);
  const total = categories.reduce((n, category) => n * BigInt(choices[category].length), 1n);
  let previousIndex = 0n, valid = true;
  for (const category of categories) {
    const index = choices[category].findIndex(item => item.id === previous[category]);
    if (index < 0) valid = false;
    previousIndex = previousIndex * BigInt(choices[category].length) + BigInt(Math.max(0, index));
  }
  const count = total - (valid && total > 1n ? 1n : 0n);
  let index = BigInt(Math.floor(random() * Number(count)));
  if (valid && total > 1n && index >= previousIndex) index++;
  const result = {};
  for (const category of [...categories].reverse()) {
    const size = BigInt(choices[category].length);
    result[category] = choices[category][Number(index % size)].id;
    index /= size;
  }
  return result;
}
