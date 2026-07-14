export class MyProfile {
  id!: string;
  pushName!: string;
  profilePicture?: string;
}

export class ProfileNameRequest {
  name!: string;
}

export class ProfileStatusRequest {
  status!: string;
}

export class ProfilePictureRequest {
  file: any;
}
