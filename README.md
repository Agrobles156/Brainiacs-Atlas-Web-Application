
# Welcome to the Brainiacs (DA-SMOOTHS) Rat Brain Atlas
Goal of this project is to provide an online interface to Swansons Rat Brain Atlas. This repo will house all the code needed for this
## Frontend
### What is used
- Next.js 10.8.2
- Node 22.14.0
- Tailwind 10.8.2
### Frontend Setup
- Install Node on your machine following this link https://nodejs.org/en/download
- cd into the atlas-frontend
- Run the command npm install or npm i
- Run the command npm run dev
- Click on the link that printed to the console
- It is important to run npm i frequently to insure that your local Node packages are updated and you add any that might be added by other devs
### Comprehensive Command List for Frontend in first terminal(In this Exact Order):
- cd atlas-frontend
- node -v (To make sure you have node; if not just google download node and select latest version)
- npm ci
- npm run dev

## Backend
### What is used
- Python 3.10 or 3.11
- Flask
- Cloud Based MongoDB Instance
### Backend Setup
- Make sure one of the two python versions are installed on your machine
- pip is usually installed with python but check if pip is installed and if it is not install it. Small note here if you are using multiple versions of python on your machine ensure that global pip is installing it to the right place
- cd into the atlas-backend
- Run the command pip install -r requirements.txt which will require all the needed packages to run the backend. the command might change depending on how your machine is set up.
- Make a copy of the .env.example file called .env - be sure to delete .env.example to avoid system confusion
- Open that file in a text editor and replace "DB_URL" on the right side of the equal sign with the url that is used to gain access to the database. This url is pinned in the teams or you can ask Ralph (Rafael) for the url - specific to Team 2 (Fall 2025)
- You will also need to replace "SERPAPI_KEY" with the a valid api key that can be gained by making a free account at this website. This will give you 100 free searches but it is important to remember that a search is made when both the brain hierarchy and atlas are pressed.
- Open another instance of a command prompt and run the command python3 main.py. On your machine it not be python3 it could be python.
- An easy way to see if the backend and database connection is working is to click on one of the brain regions to see if the Swansons notes are pulled.
- With everything working you can download the GUI interface for the database called MongoDB Compass
- With MongoDB Compass installed you will be asked to provide the same url to connect to our database.
- You will also get a link to be added to the project on MongoDB website. You will need account or will have to make an account for this part.
### Comprehensive Command List for Backend in second terminal(In this Exact Order):
- cd atlas-backend
- python -m venv .venv
- .\.venv\Scripts\Activate.ps1
- python.exe -m pip install --upgrade pip
- python -m pip install --upgrade pip setuptools wheel
- python -m pip install -r requirements.txt
- python -m pip install requests
- python create_db.py
- python main.py

## Tutorial
### Comprehensive Tutorial
[![Watch the Comprehensive Tutorial](https://img.youtube.com/vi/iJ6jixH6vHQ/maxresdefault.jpg)](https://youtu.be/iJ6jixH6vHQ)
#### [Watch the Comprehensive Tutorial](https://youtu.be/iJ6jixH6vHQ)

### Landing Page and Login/Signup Tutorial
<img width="1727" height="956" alt="sign in" src="https://github.com/user-attachments/assets/edabc082-90e3-4e0b-832f-0c0a8f7e94e7" />

#### [Watch the Landing Page and Login/Signup Tutorial](https://youtu.be/RCKbi008s84)

### Atlas Tutorial
[![Watch the Atlas Tutorial](https://img.youtube.com/vi/_0CDLhfI9Ds/maxresdefault.jpg)](https://youtu.be/_0CDLhfI9Ds)
#### [Watch the Atlas Tutorial](https://youtu.be/_0CDLhfI9Ds)

### Dual View
<img width="1727" height="957" alt="Screenshot 2025-10-10 at 5 06 20 PM" src="https://github.com/user-attachments/assets/a4362245-816e-4521-912b-a06734a47332" />

### Notes/Collection Tutorial
[![Watch the Notes/Collection Tutorial](https://img.youtube.com/vi/kt2rYZDnPYM/maxresdefault.jpg)](https://youtu.be/kt2rYZDnPYM)
#### [Watch the Notes/Collection Tutorial](https://youtu.be/kt2rYZDnPYM)

### Library Tutorial
[![Watch the Library Tutorial](https://img.youtube.com/vi/lcVTi4QJHz0/maxresdefault.jpg)](https://youtu.be/lcVTi4QJHz0)
#### [Watch the Library Tutorial](https://youtu.be/lcVTi4QJHz0)

### Paper Search Tutorial
[![Watch the Paper Search Tutorial](https://img.youtube.com/vi/dFv1KFq0kfg/maxresdefault.jpg)](https://youtu.be/dFv1KFq0kfg)
#### [Watch the Paper Search Tutorial](https://youtu.be/dFv1KFq0kfg)

### Admin Dashboard Tutorial
[![Watch the Admin Dashboard Tutorial](https://img.youtube.com/vi/PHjPU4BYS1E/maxresdefault.jpg)](https://youtu.be/PHjPU4BYS1E)
#### [Watch the Admin Dashboard Tutorial](https://youtu.be/PHjPU4BYS1E)
