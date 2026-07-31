let total = 0;

function add(value: number): number {
  total += value;
  return total;
}

add(2);
console.log(`total=${total}`);
