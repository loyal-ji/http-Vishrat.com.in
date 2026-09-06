const userEmail = String(req.user.email || "")
  .trim()
  .toLowerCase();

const isLoyalEmail =
  userEmail === "kgsias01@gmail.com";

console.log(
  "LOYAL EMAIL CHECK:",
  isLoyalEmail,
  "EMAIL:",
  userEmail
);

if (isLoyalEmail) {

  const loyalDoc =
    await db
      .collection("users")
      .doc("Loyal")
      .get();

  const loyalData =
    loyalDoc.exists
      ? loyalDoc.data() || {}
      : {};

  console.log(
    "LOYAL FIRESTORE CHECK:",
    {
      documentExists: loyalDoc.exists,
      freeAccess: loyalData.freeAccess === true,
      freeAccessType: typeof loyalData.freeAccess
    }
  );

  if (
    loyalData.freeAccess === true
  ) {

    console.log(
      "LOYAL ACCESS GRANTED:",
      batch
    );

    return res.status(200).json({
      allowed: true,
      free: true,
      batch: batch
    });
  }
}
