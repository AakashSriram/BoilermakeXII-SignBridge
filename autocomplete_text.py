#!/opt/homebrew/bin/python3
"""
Name: autocomplete_text.py
Purpose: Based on given arguments (words), it will return the list of possible words to autocomplete the given word.
"""

import enchant

dictionary = enchant.Dict("en-US")


def suggest_words(partial_word: str) -> list:
    suggestions = dictionary.suggest(partial_word)
    # Filter suggestions to maintain the original start of the word
    filtered_suggestions = [
        word for word in suggestions if word.startswith(partial_word)
    ]
    return filtered_suggestions


# Example usage
if __name__ == "__main__":
    partial = input("Enter a partial word: ")
    results = suggest_words(partial)
    print("Suggestions:", results)
