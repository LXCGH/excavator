# 3D Excavator Simulator (挖掘机模拟器)

A realistic 3D excavator simulation game built with **Three.js** and **Vite**. Drive, dig, and complete levels in this browser-based physics sandbox.

![Excavator Game](public/vite.svg)

## 🎮 Features. 

- **Realistic Excavator Model**: Fully articulated boom, stick, bucket, and rotating cab with hydraulic details.
- **Interactive Soil System**: Particle-based soil physics. Scoop, carry, and dump soil.
- **3 Progressive Levels**:
  - **Level 1**: Basics - Dig a single pile.
  - **Level 2**: Efficiency - Clear multiple piles within a time limit.
  - **Level 3**: Puzzle - Sort colored soil into matching pits (Red/Blue/Green/Yellow/Purple).
- **Path System**: Stay on the designated roads or face immediate failure!
- **Audio & Visuals**: Engine sounds, digging effects, flashing beacon lights, and dynamic camera.
- **Localization**: Full Chinese UI support.

## 🕹️ Controls

| Key | Action |
| :--- | :--- |
| **W / S** | Drive Forward / Backward (移动底座) |
| **A / D** | Turn Base Left / Right (旋转底座) |
| **Q / E** | Rotate Cab Left / Right (旋转驾驶室) |
| **Arrow Up / Down** | Lift / Lower Boom (升降大臂) |
| **Arrow Left / Right** | Extend / Retract Stick (伸缩二臂) |
| **Space** | Scoop / Dump Bucket (铲土/倒土) |

## 🚀 Getting Started

### Prerequisites
- Node.js (v14 or higher)
- npm

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/LXCGH/excavator.git
   cd excavator
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Run the development server:
   ```bash
   npm run dev
   ```
   Open your browser and navigate to the URL shown (usually `http://localhost:5173`).

## 📦 Deployment

To build for production:

```bash
npm run build
```

The output will be in the `dist` folder. See [DEPLOY.md](DEPLOY.md) for detailed deployment instructions (Vercel, Netlify, GitHub Pages).

## 🛠️ Tech Stack

- **Three.js**: 3D Rendering Engine
- **Vite**: Build Tool
- **Vanilla JavaScript**: Game Logic

## 📄 License

MIT License
