# SignBridge

SignBridge is an AI-powered application that translates American Sign Language (ASL) into text/speech and vice-versa, enabling seamless communication between the hearing and non-hearing communities.

## 🚀 Getting Started

Follow these steps to set up and run the SignBridge application locally.

### 1️. Clone the Repository

```sh
git clone https://github.com/AakashSriram/BoilermakeXII-SignBridge.git signbridge
cd signbridge
```

### 2. Scrape ASL Gestures (Optional)

This step is optional and is only if you are running the entire application locally. You will need reference videos of what each gesture looks like.

Make sure you are connected to the internet. Then, run the following command:

```sh
python scraper.py
```

This command may take a while to scrape over 10,000 various gestures or phrases.

### 3. Setup Backend (AI Processing)

#### Create a Virtual Environment

```sh
python3 -m venv venv
source venv/bin/activate   # On macOS/Linux
venv\Scripts\activate      # On Windows
```

#### Install Dependencies

```sh
pip install -r requirements.txt
```

### 4. Setup Frontend

```sh
cd asl-translator
npm install
```

### 5. Run the Application

#### Start Backend Server (Python)

```sh
cd tfliter
python app.py
```

#### Start Frontend (React)

```sh
cd asl-translator
npm run dev
```

## 🔥 Usage Guide

1. Open your browser and navigate to [http://localhost:3000/](http://localhost:3000/).
2. Use the ASL detection feature to translate sign language into text.
3. Speech-to-ASL allows real-time spoken translation into ASL gestures.
4. Enjoy seamless ASL-to-speech with multi-accent support.

## 📌 Troubleshooting

### ❌ Virtual Environment Not Activating?

-   Run `source venv/bin/activate` again (Mac/Linux)
-   On Windows, try `venv\Scripts\activate.bat`

### ❌ Frontend Issues?

-   Run `npm install` before `npm run dev`

## 🤝 Contributing

We welcome contributions! If you’d like to improve SignBridge:

1. Fork the repo
2. Create a new branch (`feature-xyz`)
3. Make changes and commit
4. Open a pull request 🚀

## 📄 License

This project is licensed under the MIT License.

## 🌟 Connect with Us

For more details, visit our Devpost page: [🔗 SignBridge on Devpost](#)

🚀 Let’s make communication more inclusive! 🌍
