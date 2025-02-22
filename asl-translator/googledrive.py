from pydrive2.auth import GoogleAuth
from pydrive2.drive import GoogleDrive
import os


# Authenticate using a Service Account
def authenticate_service_account():
    gauth = GoogleAuth()

    # Configure the settings for the service account
    gauth.settings = {
        "client_config_backend": "service",
        "service_config": {
            "client_json_file_path": "service_account.json",  # Path to your service account file
            "client_user_email": "pydrive-service-account@signbridge-451708.iam.gserviceaccount.com",
        },
        "oauth_scope": [
            "https://www.googleapis.com/auth/drive",
            "https://www.googleapis.com/auth/drive.file",
            "https://www.googleapis.com/auth/drive.appdata",
        ],
    }

    # Authenticate with the service account
    gauth.ServiceAuth()
    return GoogleDrive(gauth)


drive = authenticate_service_account()


def upload_file_to_drive(file_path: str, folder_id: str = None):
    """
    Uploads a file to Google Drive.

    :param file_path: Path to the file to upload.
    :param folder_id: ID of the Google Drive folder to upload to. If None, uploads to the root folder.
    :return: None
    """
    file_name = os.path.basename(file_path)
    file_metadata = {"title": file_name}
    if folder_id:
        file_metadata["parents"] = [{"id": folder_id}]

    file = drive.CreateFile(file_metadata)
    file.SetContentFile(file_path)
    file.Upload()

    file_id = file["id"]
    shareable_link = f"https://drive.google.com/file/d/{file_id}/view?usp=sharing"
    return shareable_link

    print(f"Uploaded {file_name} to Google Drive.")


if __name__ == "__main__":
    file_path = "/Users/ojaschaturvedi/Developer/BoilermakeXII-TeamTanay/vid.mp4"
    folder_id = "1VkEY_uqLp5O66zGqpTr8o5TNi_K4rf20"
    upload_file_to_drive(file_path, folder_id if folder_id else None)
