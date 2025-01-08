import Job from "../models/jobModel.js";

export const addJob = async (req, res) => {
  try {
    const {
      title,
      company,
      workplaceType,
      location,
      jobType,
      category,
      subCategory,
      notificationPreference,
      description, 
    } = req.body;

    // Create a new job
    const newJob = new Job({
      title,
      company,
      workplaceType,
      location,
      jobType,
      category,
      subCategory,
      notificationPreference,
      description, 
      hirer: req.user._id, // Logged-in hirer ID
    });

    await newJob.save();
    res.status(201).json({ message: "Job added successfully!", job: newJob });
  } catch (error) {
    console.error("Error adding job:", error);
    res.status(500).json({ message: "Failed to add job", error: error.message });
  }
};
export const getJobsAddedByYou = async (req, res) => {
  try {
    const hirerId = req.user._id; // Logged-in hirer's ID
    const jobs = await Job.find({ hirer: hirerId }); // Fetch jobs created by this user
    res.status(200).json({ jobs });
  } catch (error) {
    console.error("Error fetching jobs:", error);
    res.status(500).json({ message: "Failed to fetch jobs", error: error.message });
  }
};
