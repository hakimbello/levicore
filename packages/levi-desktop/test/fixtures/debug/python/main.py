total = 0


def add(value: int) -> int:
    global total
    total += value
    return total


if __name__ == "__main__":
    add(2)
    print(f"total={total}")
