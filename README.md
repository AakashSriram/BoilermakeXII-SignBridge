# SignBridge

SignBridge is an AI-powered application that translates American Sign Language (ASL) into text and speech, enabling seamless communication between the hearing and non-hearing communities.

## 🚀 Getting Started

Follow these steps to set up and run the SignBridge application.

### 1️⃣ Clone the Repository

```sh
git clone https://github.com/your-repo/signbridge.git
cd signbridge
```

### 2️⃣ Setup Backend (AI Processing)

#### Create a Virtual Environment

```sh
python3 -m venv venv
source venv/bin/activate   # On macOS/Linux
venv\Scripts\activate      # On Windows
```

#### Install Dependencies

```sh
cd tfliter
pip install -r requirements.txt
```

### 3️⃣ Setup Frontend

```sh
cd asl-translator
npm install
```

### 4️⃣ Run the Application

#### Start Backend Server (Python)

```sh
cd tfliter
python3 server.py
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
- Run `source venv/bin/activate` again (Mac/Linux)
- On Windows, try `venv\Scripts\activate.bat`

### ❌ Backend Not Running?
- Ensure dependencies are installed:

  ```sh
  pip install -r requirements.txt
  ```
  
- Check for TensorFlow errors:

  ```sh
  pip install tensorflow
  ```

### ❌ Frontend Issues?
- Run `npm install` before `npm run dev`

### ❌ CORS Errors?
- Make sure Flask-CORS is installed:

  ```sh
  pip install flask-cors
  ```

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
