import pyttsx3
import os

# Initialize the TTS engine
engine = pyttsx3.init()


# Function to list available voices
def list_available_voices():
    voices = engine.getProperty("voices")
    for voice in voices:
        print(f"ID: {voice.id}, Name: {voice.name}, Language: {voice.languages}")


# Define a dictionary to map voice types to available macOS voices
VOICE_MAP = {
    "indian": "com.apple.voice.compact.hi-IN.Lekha",
    "american": "com.apple.voice.compact.en-US.Samantha",
    "british": "com.apple.voice.compact.en-GB.Daniel",
    "australian": "com.apple.voice.compact.en-AU.Karen",
    "irish": "com.apple.voice.compact.en-IE.Moira",
    "south_african": "com.apple.voice.compact.en-ZA.Tessa",
}


def text_to_speech(
    sentence: str,
    voice: str = "indian",
    output_file: str = "output.wav",
    rate: int = 160,
) -> None:
    voice = voice.lower()
    if voice not in VOICE_MAP:
        print(f"Voice '{voice}' not recognized. Defaulting to 'indian'.")
        voice = "indian"

    # Set the voice for the engine
    available_voices = [v.id for v in engine.getProperty("voices")]
    if VOICE_MAP[voice] not in available_voices:
        print(
            f"Voice '{voice}' is not available on this system. Defaulting to 'Samantha'."
        )
        voice = "american"

    engine.setProperty("voice", VOICE_MAP[voice])

    # Set a more natural speaking rate
    engine.setProperty("rate", rate)

    print(f"Starting text-to-speech conversion using the '{voice}' voice...")

    engine.say(".")

    # Save the speech to a file
    engine.save_to_file(sentence, output_file)

    try:
        # Wait for the speech to finish
        engine.runAndWait()
    except AttributeError as e:
        print(f"Error: {e}")
        print(
            "There was an issue with the NSSpeechDriver on macOS. Try restarting the application."
        )
    engine.stop()

    # Check if file is created
    if os.path.exists(output_file):
        print(f"Audio saved as {output_file}")
    else:
        print("Failed to save audio file.")


# Example usage
if __name__ == "__main__":
    list_available_voices()
    text_to_speech(
        "Hello, this is a test of the text-to-speech function. I like curry. Street food is amazing.",
        voice="indian",
    )
