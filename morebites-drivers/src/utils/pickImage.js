import { Alert, Platform } from "react-native";
import * as ImagePicker from "expo-image-picker";

function pickWithFileInput() {
  return new Promise((resolve) => {
    if (typeof document === "undefined") {
      resolve(null);
      return;
    }

    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.style.display = "none";

    const cleanup = () => {
      input.remove();
    };

    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        cleanup();
        resolve(null);
        return;
      }

      const uri = URL.createObjectURL(file);
      cleanup();
      resolve({
        uri,
        mimeType: file.type || "image/jpeg",
        fileName: file.name || "photo.jpg",
        file,
      });
    };

    input.oncancel = () => {
      cleanup();
      resolve(null);
    };

    document.body.appendChild(input);
    input.click();
  });
}

async function pickFromLibrary({ aspect, quality, allowsEditing }) {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    Alert.alert(
      "Permission needed",
      "Allow photo library access to upload pictures.",
    );
    return null;
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsEditing: Platform.OS === "ios" ? allowsEditing : false,
    aspect,
    quality,
  });

  if (result.canceled || !result.assets?.[0]?.uri) return null;
  const asset = result.assets[0];
  return {
    uri: asset.uri,
    mimeType: asset.mimeType || "image/jpeg",
    fileName: asset.fileName || "photo.jpg",
  };
}

async function pickFromCamera({ aspect, quality, allowsEditing }) {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    Alert.alert("Permission needed", "Allow camera access to take a photo.");
    return null;
  }

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ["images"],
    allowsEditing: Platform.OS === "ios" ? allowsEditing : false,
    aspect,
    quality,
  });

  if (result.canceled || !result.assets?.[0]?.uri) return null;
  const asset = result.assets[0];
  return {
    uri: asset.uri,
    mimeType: asset.mimeType || "image/jpeg",
    fileName: asset.fileName || "photo.jpg",
  };
}

/**
 * Cross-platform image picker.
 * Web uses a file input. Native offers Camera or Gallery.
 */
export async function pickImage({
  aspect = [1, 1],
  quality = 0.5,
  allowsEditing = true,
} = {}) {
  try {
    if (Platform.OS === "web") {
      return await pickWithFileInput();
    }

    return await new Promise((resolve) => {
      Alert.alert("Add photo", "Choose a source", [
        {
          text: "Camera",
          onPress: async () => {
            resolve(await pickFromCamera({ aspect, quality, allowsEditing }));
          },
        },
        {
          text: "Gallery",
          onPress: async () => {
            resolve(await pickFromLibrary({ aspect, quality, allowsEditing }));
          },
        },
        {
          text: "Cancel",
          style: "cancel",
          onPress: () => resolve(null),
        },
      ]);
    });
  } catch (err) {
    if (Platform.OS === "web") {
      return await pickWithFileInput();
    }
    Alert.alert(
      "Upload failed",
      err?.message || "Could not open the photo picker.",
    );
    return null;
  }
}
