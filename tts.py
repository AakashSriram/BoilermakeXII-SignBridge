from gtts import gTTS
from pydub import AudioSegment
import os


def text_to_speech_gtts(
    sentence: str, language: str = "en", accent: str = "com", gender: str = "female"
):
    """
    :param sentence: Text to convert to speech
    :param language: Language code (e.g., 'en' for English)
    :param accent: TLD for accents ('com' = US, 'co.uk' = British, 'co.in' = Indian)
    :param gender: 'male' or 'female' (adjusts pitch to simulate gender)
    """
    tts = gTTS(text=sentence, lang=language, tld=accent)
    output_file = "output.wav"
    tts.save(output_file)

    # Adjust pitch for a male-sounding voice
    if gender.lower() == "male":
        sound = AudioSegment.from_file(output_file)
        # Lower pitch to simulate a male voice (slows down the speed slightly too)
        sound = sound._spawn(
            sound.raw_data, overrides={"frame_rate": int(sound.frame_rate * 0.85)}
        )
        sound = sound.set_frame_rate(44100)
        sound.export(output_file, format="wav")

    os.system(
        f"afplay {output_file}"
    )  # macOS playback, use 'start' for Windows, 'mpg321' for Linux
    print(f"Audio saved as {output_file}")


# Example usage with different accents and gender simulation
text_to_speech_gtts(
    "Hello, this is a test with an American male voice.", accent="com", gender="male"
)
text_to_speech_gtts(
    "Hello, this is a test with a British female voice.",
    accent="co.uk",
    gender="female",
)
text_to_speech_gtts(
    "Hello, this is a test with an Indian male voice.", accent="co.in", gender="male"
)
text_to_speech_gtts(
    "Hello, this is a test with an Indian female voice.",
    accent="co.in",
    gender="female",
)
text_to_speech_gtts(
    "Hello, this is a test with an Australian female voice.",
    accent="com.au",
    gender="female",
)
