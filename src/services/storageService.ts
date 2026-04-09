import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';

import { storage } from './firebaseClient';

function getFileExtension(imageUri: string) {
  const sanitizedUri = String(imageUri || '').split('?')[0];
  const match = sanitizedUri.match(/\.([a-zA-Z0-9]+)$/);
  return match?.[1]?.toLowerCase() || 'jpg';
}

function getContentType(extension: string) {
  switch (extension) {
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'heic':
    case 'heif':
      return 'image/heic';
    default:
      return 'image/jpeg';
  }
}

function uriToBlob(imageUri: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.onload = () => {
      resolve(xhr.response);
    };
    xhr.onerror = () => {
      reject(new Error('Could not read the selected image.'));
    };
    xhr.responseType = 'blob';
    xhr.open('GET', imageUri, true);
    xhr.send();
  });
}

export async function uploadPetImage(ownerId: string, imageUri: string): Promise<string> {
  if (!ownerId) {
    throw new Error('Missing owner id for pet image upload.');
  }

  if (!imageUri) {
    throw new Error('Missing image URI for pet image upload.');
  }

  const extension = getFileExtension(imageUri);
  const contentType = getContentType(extension);
  const storageRef = ref(storage, `petImages/${ownerId}/${Date.now()}.${extension}`);
  const imageBlob = await uriToBlob(imageUri);

  try {
    await uploadBytes(storageRef, imageBlob, { contentType });
    return await getDownloadURL(storageRef);
  } finally {
    if (typeof imageBlob.close === 'function') {
      imageBlob.close();
    }
  }
}

export async function deletePetImageByUrl(imageUrl: string): Promise<void> {
  if (!imageUrl || !/^https?:\/\//i.test(imageUrl)) {
    return;
  }

  const imageRef = ref(storage, imageUrl);
  await deleteObject(imageRef);
}