import { db } from "./firebase";
import { collection, addDoc } from "firebase/firestore";

async function addStudent() {
  try {
    const docRef = await addDoc(collection(db, "students"), {
      name: "Sushanth",
      usn: "1JB24IS157",
      department: "ISE"
    });

    console.log("Document written with ID:", docRef.id);
  } catch (error) {
    console.error("Error adding document:", error);
  }
}

addStudent();